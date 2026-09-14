"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";
import { assessClientReturn } from "@/lib/client-return";
import { draftClientReturnMessage } from "@/lib/client-return-message";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured, isTelegramConfigured } from "@/lib/env";
import { sendClientReturnReminderTelegram } from "@/lib/notifications";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { formatPublicProfileLink } from "@/lib/site";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  clientReturnReminderCooldownDays,
  getLastClientReturnReminderAt,
  recordClientReturnReminder,
  resolveClientReturnChat,
} from "@/lib/telegram/client-return-reminder";

// Напоминание «давно не были» из карточки клиента. Два шага: ИИ пишет
// черновик, мастер правит и отправляет. Слать без показа мастеру нельзя —
// это его слова его клиенту.

export type ClientReturnActionState = {
  success: boolean;
  message: string;
  draft?: string;
  // Шаблон детерминирован: два одинаковых черновика подряд интерфейс должен
  // различать, иначе после «Отменить» второй не покажется.
  draftId?: string;
  draftSource?: "ai" | "fallback";
};

const clientIdSchema = z.object({ clientId: z.string().uuid() });

const messageMaxLength = 600;

const sendSchema = z.object({
  clientId: z.string().uuid(),
  text: z.string().trim().min(10).max(messageMaxLength),
  draft: z.string().trim().max(messageMaxLength * 2).optional(),
});

async function requireProfile() {
  if (!isSupabaseConfigured) return null;

  const authProfile = await getCurrentAuthProfile();

  return authProfile?.profile ?? null;
}

// История клиента для промпта. Всё — сервисной ролью, но строго внутри
// profile_id: карточка чужого клиента сюда попасть не должна.
async function loadClientContext(input: { profileId: string; clientId: string; timezone: string }) {
  const admin = createSupabaseAdminClient();

  const [clientResult, bookingResult, serviceResult] = await Promise.all([
    admin
      .from("clients")
      .select("id, name, notes")
      .eq("id", input.clientId)
      .eq("profile_id", input.profileId)
      .maybeSingle(),
    admin
      .from("bookings")
      .select("id, service_id, starts_at, status, visit_status")
      .eq("client_id", input.clientId)
      .eq("profile_id", input.profileId)
      .eq("status", "confirmed")
      .order("starts_at", { ascending: false })
      .limit(50),
    admin
      .from("services")
      .select("id, title, repeat_interval_days")
      .eq("profile_id", input.profileId),
  ]);

  if (clientResult.error || !clientResult.data || bookingResult.error || serviceResult.error) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const bookings = (bookingResult.data ?? []) as Array<{
    id: string;
    service_id: string;
    starts_at: string;
    visit_status: string | null;
  }>;
  const services = ((serviceResult.data ?? []) as Array<{
    id: string;
    title: string;
    repeat_interval_days: number | null;
  }>).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    repeatIntervalDays:
      row.repeat_interval_days === null || row.repeat_interval_days === undefined
        ? null
        : Number(row.repeat_interval_days),
  }));

  // Несостоявшиеся визиты в историю не идут: напоминать «после маникюра»
  // тому, кто на него не пришёл, — мимо.
  const pastVisits = bookings
    .filter(
      (booking) =>
        String(booking.starts_at) <= nowIso &&
        !["no_show", "cancelled_late", "cancelled_ok"].includes(booking.visit_status ?? ""),
    )
    .map((booking) => ({ startsAtIso: String(booking.starts_at), serviceId: String(booking.service_id) }));

  const assessment = assessClientReturn({
    pastVisits,
    hasUpcomingVisit: bookings.some((booking) => String(booking.starts_at) > nowIso),
    services,
    timezone: input.timezone,
  });

  const serviceTitle = new Map(services.map((service) => [service.id, service.title]));
  const counts = new Map<string, number>();

  for (const visit of pastVisits) {
    counts.set(visit.serviceId, (counts.get(visit.serviceId) ?? 0) + 1);
  }

  const preferredServices = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([serviceId]) => serviceTitle.get(serviceId))
    .filter((title): title is string => Boolean(title));

  return {
    client: {
      name: String(clientResult.data.name),
      notes: String(clientResult.data.notes ?? ""),
      daysSinceLastVisit: assessment.daysSinceLastVisit,
      lastServiceTitle: assessment.lastServiceTitle,
      preferredServices,
      totalVisits: pastVisits.length,
    },
  };
}

export async function draftClientReturnReminderAction(
  _prevState: ClientReturnActionState,
  formData: FormData,
): Promise<ClientReturnActionState> {
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = clientIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: "Не удалось определить клиента." };
  }

  const context = await loadClientContext({
    profileId: profile.id,
    clientId: parsed.data.clientId,
    timezone: profile.timezone,
  });

  if (!context) {
    return { success: false, message: "Клиент не найден." };
  }

  const draft = await draftClientReturnMessage({
    master: { fullName: profile.fullName, specialty: profile.specialty },
    client: context.client,
  });

  return {
    success: true,
    message:
      draft.source === "ai"
        ? "Черновик готов. Поправь, если нужно, и отправь."
        : "ИИ сейчас недоступен — подставили простой шаблон. Поправь и отправь.",
    draft: draft.text,
    draftId: randomUUID(),
    draftSource: draft.source,
  };
}

export async function sendClientReturnReminderAction(
  _prevState: ClientReturnActionState,
  formData: FormData,
): Promise<ClientReturnActionState> {
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  if (!isTelegramConfigured) {
    return { success: false, message: "Telegram-бот пока не подключен на платформе." };
  }

  const parsed = sendSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: `Текст должен быть от 10 до ${messageMaxLength} символов.`,
    };
  }

  const { clientId, text, draft } = parsed.data;

  // Лимит проверяется на сервере, а не только скрыт кнопкой в интерфейсе:
  // это единственное, что отделяет напоминание от рассылки.
  const lastSentAtIso = await getLastClientReturnReminderAt({ clientId });

  if (lastSentAtIso) {
    const nextAllowed = DateTime.fromISO(lastSentAtIso).plus({
      days: clientReturnReminderCooldownDays,
    });

    if (nextAllowed > DateTime.utc()) {
      return {
        success: false,
        message: `Этому клиенту уже напоминали недавно. Следующее можно отправить ${nextAllowed
          .setZone(profile.timezone)
          .setLocale("ru")
          .toFormat("d LLLL")}.`,
      };
    }
  }

  const chatId = await resolveClientReturnChat({ profileId: profile.id, clientId });

  if (!chatId) {
    return {
      success: false,
      message: "Клиент не подключал напоминания в Telegram — написать ему можно только по телефону.",
    };
  }

  const result = await sendClientReturnReminderTelegram({
    chatId,
    masterName: profile.fullName,
    text,
    bookingUrl: `https://${formatPublicProfileLink(profile.username)}/book`,
  });

  if (!result.ok) {
    if (result.skipped) {
      // 403 от Telegram: клиент заблокировал бота, привязка уже погашена.
      revalidatePath("/clients");

      return {
        success: false,
        message: "Клиент отключил бота — сообщение не доставить.",
      };
    }

    logError("Failed to send client return reminder", { profileId: profile.id, clientId });

    return { success: false, message: "Не получилось отправить. Попробуй ещё раз через минуту." };
  }

  await recordClientReturnReminder({
    profileId: profile.id,
    clientId,
    chatId,
    message: text,
    draftMessage: draft || null,
  });

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "client.return_reminder.sent",
    targetType: "client",
    targetId: clientId,
    metadata: { channel: "telegram", edited: Boolean(draft) && draft !== text },
  });

  revalidatePath("/clients");

  return { success: true, message: "Отправили клиенту в Telegram." };
}
