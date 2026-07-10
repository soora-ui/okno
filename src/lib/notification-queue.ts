import { DateTime } from "luxon";
import type { Profile } from "@/lib/mock-data";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingConfirmationSms,
  sendClientReminderSms,
  sendGiftCertificateCodeSms,
  sendMasterReminderTelegram,
  sendMasterTelegramNotification,
  sendRepeatVisitReminderSms,
} from "@/lib/notifications";

type NotificationEventJob = {
  id: string;
  type:
    | "sms_confirmation"
    | "telegram_new_booking"
    | "sms_reminder_client"
    | "telegram_reminder_master"
    | "sms_repeat_visit_reminder"
    | "sms_certificate_code";
  target: string;
  payload: Record<string, unknown>;
  attempts: number;
};

function parseJob(row: Record<string, unknown>): NotificationEventJob {
  return {
    id: String(row.id),
    type:
      row.type === "telegram_new_booking"
        ? "telegram_new_booking"
        : row.type === "sms_reminder_client"
          ? "sms_reminder_client"
          : row.type === "telegram_reminder_master"
            ? "telegram_reminder_master"
            : row.type === "sms_repeat_visit_reminder"
              ? "sms_repeat_visit_reminder"
              : row.type === "sms_certificate_code"
                ? "sms_certificate_code"
                : "sms_confirmation",
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

  if (job.type === "sms_certificate_code") {
    const result = await sendGiftCertificateCodeSms({
      phone: String(job.payload.phone ?? job.target),
      masterName: String(job.payload.masterName ?? ""),
      amount: Number(job.payload.amount ?? 0),
      code: String(job.payload.code ?? ""),
      expiresAtLabel: String(job.payload.expiresAtLabel ?? ""),
    });

    return {
      ok: result.ok,
      skipped: result.skipped,
      lastError: result.ok || result.skipped ? null : "Код сертификата не отправился.",
    };
  }

  if (job.type === "telegram_reminder_master") {
    const result = await sendMasterReminderTelegram({
      chatId: String(job.payload.chatId ?? job.target ?? ""),
      clientName: String(job.payload.clientName ?? ""),
      serviceTitle: String(job.payload.serviceTitle ?? ""),
      startsAtLabel: String(job.payload.startsAtLabel ?? ""),
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
  });

  return {
    ok: result.ok,
    skipped: result.skipped,
    lastError:
      result.ok || result.skipped ? null : "Уведомление в Telegram не отправилось.",
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
    .toFormat("d LLLL, HH:mm");

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
        },
      });
    }
  }

  return rows;
}

// Отдельная функция (а не часть buildReminderNotificationEvents): напоминание
// о повторном визите ставится только если клиент явно согласился (галочка на
// форме записи) и зависит от repeat_interval_weeks конкретной услуги, а не от
// профильных reminder-часов мастера.
export function buildRepeatVisitReminderEvent(input: {
  profileId: string;
  bookingId: string;
  phone: string;
  masterName: string;
  serviceTitle: string;
  startsAtIso: string;
  repeatIntervalWeeks: number;
}) {
  const startsAt = DateTime.fromISO(input.startsAtIso, { zone: "utc" });

  if (!startsAt.isValid || input.repeatIntervalWeeks <= 0) {
    return null;
  }

  const scheduledFor = startsAt.plus({ weeks: input.repeatIntervalWeeks });

  return {
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
  };
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
      "telegram_reminder_master",
      "sms_repeat_visit_reminder",
    ])
    .eq("status", "queued");
}
