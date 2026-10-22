import { DateTime } from "luxon";
import type { Profile } from "@/lib/mock-data";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingConfirmationSms,
  sendClientCancelledTelegram,
  sendClientReminderSms,
  sendClientRepeatVisitTelegram,
  sendClientReminderTelegram,
  sendMasterReminderTelegram,
  sendMasterTelegramNotification,
  sendRepeatVisitReminderSms,
} from "@/lib/notifications";
import {
  getClientChatForBooking,
  getClientLinkedBooking,
} from "@/lib/telegram/client-link";
import { getClientChatByBookingIdentity } from "@/lib/telegram/client-identity";
import { formatPublicProfileLink } from "@/lib/site";
import { env } from "@/lib/env";

type NotificationEventJob = {
  id: string;
  type:
    | "sms_confirmation"
    | "telegram_new_booking"
    | "sms_reminder_client"
    | "telegram_reminder_client"
    | "telegram_client_cancelled"
    | "telegram_reminder_master"
    | "sms_repeat_visit_reminder"
    | "telegram_repeat_visit_client";
  target: string;
  payload: Record<string, unknown>;
  attempts: number;
};

// Раньше здесь была лестница тернарников, и каждый новый тип требовал ещё
// одной ступеньки. Набор держим рядом с типом: забыть добавить сюда — значит
// молча получить sms_confirmation вместо своего события.
const knownJobTypes = new Set<NotificationEventJob["type"]>([
  "sms_confirmation",
  "telegram_new_booking",
  "sms_reminder_client",
  "telegram_reminder_client",
  "telegram_client_cancelled",
  "telegram_reminder_master",
  "sms_repeat_visit_reminder",
  "telegram_repeat_visit_client",
]);

// Ссылки в кнопках Telegram: только абсолютные и только https, иначе кнопка
// не отрисуется. В разработке сообщение уходит без неё.
const appOrigin = env.appUrl.replace(/\/$/, "");

const isKnownJobType = (value: unknown): value is NotificationEventJob["type"] =>
  typeof value === "string" &&
  knownJobTypes.has(value as NotificationEventJob["type"]);

function parseJob(row: Record<string, unknown>): NotificationEventJob {
  return {
    id: String(row.id),
    type: isKnownJobType(row.type) ? row.type : "sms_confirmation",
    target: String(row.target ?? ""),
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    attempts: Number(row.attempts ?? 0),
  };
}

async function processNotificationJob(job: NotificationEventJob) {
  if (job.type === "sms_confirmation") {
    const result = await sendBookingConfirmationSms({
      phone: String(job.payload.phone ?? job.target),
      masterName: String(job.payload.masterName ?? ""),
      serviceTitle: String(job.payload.serviceTitle ?? ""),
      startsAtLabel: String(job.payload.startsAtLabel ?? ""),
    });

    return {
      ok: result.ok,
      skipped: result.skipped,
      lastError: result.ok || result.skipped ? null : "SMS не удалось отправить.",
    };
  }

  if (job.type === "sms_reminder_client") {
    const result = await sendClientReminderSms({
      phone: String(job.payload.phone ?? job.target),
      masterName: String(job.payload.masterName ?? ""),
      serviceTitle: String(job.payload.serviceTitle ?? ""),
      startsAtLabel: String(job.payload.startsAtLabel ?? ""),
    });

    return {
      ok: result.ok,
      skipped: result.skipped,
      lastError:
        result.ok || result.skipped ? null : "Напоминание клиенту по SMS не отправилось.",
    };
  }

  // Клиентские события держат в payload только id записи: всё остальное
  // читается в момент отправки. Так перенос не оставляет в очереди сообщение
  // со старым временем — строка одна, а время в ней всегда актуальное.
  if (job.type === "telegram_reminder_client") {
    return sendClientBookingMessage(job, "reminder");
  }

  if (job.type === "telegram_client_cancelled") {
    return sendClientBookingMessage(job, "cancelled");
  }

  if (job.type === "telegram_repeat_visit_client") {
    return sendClientBookingMessage(job, "repeat_visit");
  }

  if (job.type === "telegram_reminder_master") {
    const result = await sendMasterReminderTelegram({
      chatId: String(job.payload.chatId ?? job.target ?? ""),
      clientName: String(job.payload.clientName ?? ""),
      serviceTitle: String(job.payload.serviceTitle ?? ""),
      startsAtLabel: String(job.payload.startsAtLabel ?? ""),
      bookingId: job.payload.bookingId ? String(job.payload.bookingId) : null,
    });

    return {
      ok: result.ok,
      skipped: result.skipped,
      lastError:
        result.ok || result.skipped
          ? null
          : "Напоминание мастеру в Telegram не отправилось.",
    };
  }

  if (job.type === "sms_repeat_visit_reminder") {
    const result = await sendRepeatVisitReminderSms({
      phone: String(job.payload.phone ?? job.target),
      masterName: String(job.payload.masterName ?? ""),
      serviceTitle: String(job.payload.serviceTitle ?? ""),
    });

    return {
      ok: result.ok,
      skipped: result.skipped,
      lastError:
        result.ok || result.skipped
          ? null
          : "Напоминание о повторном визите не отправилось.",
    };
  }

  const result = await sendMasterTelegramNotification({
    chatId: String(job.payload.chatId ?? job.target ?? ""),
    clientName: String(job.payload.clientName ?? ""),
    serviceTitle: String(job.payload.serviceTitle ?? ""),
    startsAtLabel: String(job.payload.startsAtLabel ?? ""),
    discountLabel: job.payload.discountLabel ? String(job.payload.discountLabel) : null,
    bookingId: job.payload.bookingId ? String(job.payload.bookingId) : null,
  });

  return {
    ok: result.ok,
    skipped: result.skipped,
    lastError:
      result.ok || result.skipped ? null : "Уведомление в Telegram не отправилось.",
  };
}

async function sendClientBookingMessage(
  job: NotificationEventJob,
  kind: "reminder" | "cancelled" | "repeat_visit",
) {
  const bookingId = String(job.payload.bookingId ?? job.target ?? "");

  // Две дороги до чата, и порядок важен. Привязка по записи точнее: её сделали
  // именно для этого визита. Личность по телефону — шире: она покрывает записи,
  // о которых клиент нас не просил, потому что один раз поделился номером.
  const chatId =
    (await getClientChatForBooking({ bookingId })) ??
    (await getClientChatByBookingIdentity({ bookingId }));

  // Клиент не подключал Telegram или отписался. Это обычный исход, а не сбой:
  // закрываем событие, чтобы очередь не ретраила его до конца попыток.
  if (!chatId) {
    return { ok: false, skipped: true, lastError: null };
  }

  const booking = await getClientLinkedBooking({ bookingId });

  if (!booking) {
    return {
      ok: false,
      skipped: true,
      lastError: null,
    };
  }

  const startsAtLabel = DateTime.fromISO(booking.startsAtIso, { zone: "utc" })
    .setZone(booking.timezone)
    .setLocale("ru")
    .toFormat("d MMMM, HH:mm");

  if (kind === "reminder") {
    const result = await sendClientReminderTelegram({
      chatId,
      masterName: booking.masterName,
      serviceTitle: booking.serviceTitle,
      startsAtLabel,
      cancelUrl: booking.cancellationToken
        ? `${appOrigin}/cancel/${booking.cancellationToken}`
        : null,
    });

    return {
      ok: result.ok,
      skipped: result.skipped,
      lastError:
        result.ok || result.skipped
          ? null
          : "Напоминание клиенту в Telegram не отправилось.",
    };
  }

  if (kind === "repeat_visit") {
    const result = await sendClientRepeatVisitTelegram({
      chatId,
      masterName: booking.masterName,
      serviceTitle: booking.serviceTitle,
      bookingUrl:
        booking.masterUsername && booking.serviceId
          ? `https://${formatPublicProfileLink(booking.masterUsername)}/book?service=${booking.serviceId}`
          : null,
    });

    return {
      ok: result.ok,
      skipped: result.skipped,
      lastError:
        result.ok || result.skipped
          ? null
          : "Напоминание о повторном визите в Telegram не отправилось.",
    };
  }

  const result = await sendClientCancelledTelegram({
    chatId,
    masterName: booking.masterName,
    serviceTitle: booking.serviceTitle,
    startsAtLabel,
    bookingUrl: booking.masterUsername
      ? `https://${formatPublicProfileLink(booking.masterUsername)}`
      : null,
  });

  return {
    ok: result.ok,
    skipped: result.skipped,
    lastError:
      result.ok || result.skipped
        ? null
        : "Сообщение об отмене клиенту в Telegram не отправилось.",
  };
}

async function finalizeNotificationJob(input: {
  job: NotificationEventJob;
  result:
    | { ok: boolean; skipped: boolean; lastError: string | null }
    | { failed: true; lastError: string };
}) {
  const admin = createSupabaseAdminClient();

  if ("failed" in input.result) {
    await admin
      .from("notification_events")
      .update({
        status: "failed",
        attempts: input.job.attempts + 1,
        processed_at: null,
        last_error: input.result.lastError,
      })
      .eq("id", input.job.id);
    return;
  }

  await admin
    .from("notification_events")
    .update({
      status: input.result.ok ? "sent" : input.result.skipped ? "cancelled" : "failed",
      attempts: input.job.attempts + 1,
      processed_at: input.result.ok || input.result.skipped ? new Date().toISOString() : null,
      last_error: input.result.lastError,
    })
    .eq("id", input.job.id);
}

async function processClaimedJobs(rows: Record<string, unknown>[]) {
  const jobs = rows.map((row) => parseJob(row));

  await Promise.all(
    jobs.map(async (job) => {
      try {
        const result = await processNotificationJob(job);
        await finalizeNotificationJob({ job, result });
      } catch (error) {
        await finalizeNotificationJob({
          job,
          result: {
            failed: true,
            lastError:
              error instanceof Error ? error.message : "Неизвестная ошибка отправки.",
          },
        });
      }
    }),
  );
}

export async function processNotificationQueue(eventIds: string[]) {
  if (eventIds.length === 0) {
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_events")
    .update({ status: "processing" })
    .in("id", eventIds)
    .eq("status", "queued")
    .select("id, type, target, payload, attempts");

  if (error) {
    logError("Notification queue claim failed", { eventIds, error });
    return;
  }

  await processClaimedJobs((data ?? []) as Record<string, unknown>[]);
}

export async function processDueNotificationQueue(limit = 50) {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("notification_events")
    .update({ status: "processing" })
    .eq("status", "queued")
    .is("processed_at", null)
    .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
    .select("id, type, target, payload, attempts")
    .limit(limit);

  if (error) {
    throw new Error("Не получилось забрать очередь уведомлений.");
  }

  const claimedRows = (data ?? []) as Record<string, unknown>[];
  await processClaimedJobs(claimedRows);

  return { claimed: claimedRows.length };
}

export function buildReminderNotificationEvents(input: {
  profile: Pick<
    Profile,
    | "id"
    | "fullName"
    | "timezone"
    | "telegramChatId"
    | "clientReminderHours"
    | "masterReminderHours"
  >;
  bookingId: string;
  phone: string;
  clientName: string;
  serviceTitle: string;
  startsAtIso: string;
}) {
  const startsAt = DateTime.fromISO(input.startsAtIso, { zone: "utc" });
  const now = DateTime.now().toUTC();
  const startsAtLabel = startsAt
    .setZone(input.profile.timezone)
    .setLocale("ru")
    .toFormat("d MMMM, HH:mm");

  const rows: Array<Record<string, unknown>> = [];

  if (input.profile.clientReminderHours > 0) {
    const scheduledFor = startsAt.minus({ hours: input.profile.clientReminderHours });
    if (scheduledFor > now) {
      rows.push({
        profile_id: input.profile.id,
        booking_id: input.bookingId,
        type: "sms_reminder_client",
        status: "queued",
        target: input.phone,
        scheduled_for: scheduledFor.toISO(),
        payload: {
          phone: input.phone,
          masterName: input.profile.fullName,
          serviceTitle: input.serviceTitle,
          startsAtLabel,
        },
      });
    }
  }

  // Ставится независимо от того, привязал ли клиент Telegram: привязка
  // происходит уже после записи, на странице подтверждения, и знать о ней в
  // момент создания записи нельзя. Если чата не окажется — событие закроется
  // как пропущенное при отправке.
  if (input.profile.clientReminderHours > 0) {
    const scheduledFor = startsAt.minus({ hours: input.profile.clientReminderHours });
    if (scheduledFor > now) {
      rows.push({
        profile_id: input.profile.id,
        booking_id: input.bookingId,
        type: "telegram_reminder_client",
        status: "queued",
        target: input.bookingId,
        scheduled_for: scheduledFor.toISO(),
        payload: { bookingId: input.bookingId },
      });
    }
  }

  if (input.profile.masterReminderHours > 0 && input.profile.telegramChatId) {
    const scheduledFor = startsAt.minus({ hours: input.profile.masterReminderHours });
    if (scheduledFor > now) {
      rows.push({
        profile_id: input.profile.id,
        booking_id: input.bookingId,
        type: "telegram_reminder_master",
        status: "queued",
        target: input.profile.telegramChatId,
        scheduled_for: scheduledFor.toISO(),
        payload: {
          chatId: input.profile.telegramChatId,
          clientName: input.clientName,
          serviceTitle: input.serviceTitle,
          startsAtLabel,
          // Нужен боту, чтобы к напоминанию прицепить кнопку «Открыть запись».
          bookingId: input.bookingId,
        },
      });
    }
  }

  return rows;
}

// Отдельная функция (а не часть buildReminderNotificationEvents): напоминание
// о повторном визите ставится только если клиент явно согласился (галочка на
// форме записи) и зависит от repeat_interval_days конкретной услуги, а не от
// профильных reminder-часов мастера.
//
// Срок берётся из того же поля, по которому AI-консультант предлагает клиенту
// записаться повторно. Разойтись они не могут по построению — а если бы
// считались из разных мест, клиент получил бы от сервиса две даты со ссылкой
// на одного мастера.
export function buildRepeatVisitReminderEvent(input: {
  profileId: string;
  bookingId: string;
  phone: string;
  masterName: string;
  serviceTitle: string;
  startsAtIso: string;
  repeatIntervalDays: number;
}) {
  const startsAt = DateTime.fromISO(input.startsAtIso, { zone: "utc" });

  if (!startsAt.isValid || input.repeatIntervalDays <= 0) {
    return [];
  }

  const scheduledFor = startsAt.plus({ days: input.repeatIntervalDays });

  // Два канала на одно напоминание, как и у напоминания о визите. SMS остаётся
  // ради материковых номеров и мастеров со своим ключом; Telegram — то, что
  // реально доходит. Оба закроются как пропущенные, если канала нет.
  return [
    {
      profile_id: input.profileId,
      booking_id: input.bookingId,
      type: "sms_repeat_visit_reminder",
      status: "queued",
      target: input.phone,
      scheduled_for: scheduledFor.toISO(),
      payload: {
        phone: input.phone,
        masterName: input.masterName,
        serviceTitle: input.serviceTitle,
      },
    },
    {
      profile_id: input.profileId,
      booking_id: input.bookingId,
      type: "telegram_repeat_visit_client",
      status: "queued",
      target: input.bookingId,
      scheduled_for: scheduledFor.toISO(),
      payload: { bookingId: input.bookingId },
    },
  ];
}

export async function cancelQueuedReminderEvents(bookingId: string) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("notification_events")
    .update({
      status: "cancelled",
      processed_at: new Date().toISOString(),
      last_error: "Напоминание отменено из-за изменения или отмены записи.",
    })
    .eq("booking_id", bookingId)
    .in("type", [
      "sms_reminder_client",
      "telegram_reminder_client",
      "telegram_reminder_master",
      "sms_repeat_visit_reminder",
      "telegram_repeat_visit_client",
    ])
    .eq("status", "queued");
}

// Сообщение клиенту о том, что мастер отменил визит.
//
// Отдельным событием, а не прямой отправкой из экшена: очередь уже умеет
// повторы, статусы и разбор недоступного чата, и отмена записи не должна
// падать из-за того, что Telegram ответил 502. scheduled_for не задаём —
// заберётся ближайшим проходом cron, то есть в пределах минуты.
export function buildClientCancelledNotificationEvent(input: {
  profileId: string;
  bookingId: string;
}) {
  return {
    profile_id: input.profileId,
    booking_id: input.bookingId,
    type: "telegram_client_cancelled",
    status: "queued",
    target: input.bookingId,
    scheduled_for: null,
    payload: { bookingId: input.bookingId },
  };
}
