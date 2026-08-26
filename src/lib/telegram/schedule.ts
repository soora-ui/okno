import { DateTime } from "luxon";
import { decryptPhone } from "@/lib/booking";
import {
  buildClientCancelledNotificationEvent,
  cancelQueuedReminderEvents,
} from "@/lib/notification-queue";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TelegramLinkedProfile } from "@/lib/telegram/link";

// Чтение расписания и отмена записи для бота.
//
// Кабинет ходит в базу через клиент с сессией мастера, у бота сессии нет:
// личность подтверждена привязкой чата, дальше запросы идут сервисной ролью и
// обязательно с фильтром по profile_id — он здесь заменяет RLS.

export type TelegramBookingSummary = {
  id: string;
  startsAt: DateTime;
  endsAt: DateTime;
  clientName: string;
  clientPhone: string;
  serviceTitle: string;
  servicePrice: number | null;
  note: string;
};

type BookingRow = Record<string, unknown>;

const bookingSelect =
  "id, starts_at, ends_at, status, client_note, clients(name, phone_encrypted, phone_last4), services(title, price)";

// PostgREST на связи «многие к одному» отдаёт объект, но без сгенерированных
// типов supabase-js описывает вложенную связь массивом. Приводим оба варианта
// к одному виду, чтобы форматирование не зависело от того, что вернул клиент.
function embeddedRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined) ?? null;
  }

  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function safeDecryptPhone(row: Record<string, unknown> | null | undefined) {
  if (!row) {
    return "";
  }

  const encrypted = row.phone_encrypted ? String(row.phone_encrypted) : "";

  if (encrypted) {
    try {
      return decryptPhone(encrypted);
    } catch (error) {
      logError("Failed to decrypt phone for telegram card", { error });
    }
  }

  const last4 = row.phone_last4 ? String(row.phone_last4) : "";

  return last4 ? `···${last4}` : "";
}

function mapBooking(row: BookingRow, timezone: string): TelegramBookingSummary {
  const client = embeddedRow(row.clients);
  const service = embeddedRow(row.services);

  return {
    id: String(row.id),
    startsAt: DateTime.fromISO(String(row.starts_at), { zone: "utc" }).setZone(timezone),
    endsAt: DateTime.fromISO(String(row.ends_at), { zone: "utc" }).setZone(timezone),
    clientName: client?.name ? String(client.name) : "Без имени",
    clientPhone: safeDecryptPhone(client),
    serviceTitle: service?.title ? String(service.title) : "Услуга",
    servicePrice:
      service && service.price !== null && service.price !== undefined
        ? Number(service.price)
        : null,
    note: row.client_note ? String(row.client_note) : "",
  };
}

export async function getTelegramBookingsInRange(input: {
  profile: TelegramLinkedProfile;
  from: DateTime;
  to: DateTime;
}): Promise<TelegramBookingSummary[]> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("bookings")
    .select(bookingSelect)
    .eq("profile_id", input.profile.id)
    .eq("status", "confirmed")
    .gte("starts_at", input.from.toUTC().toISO()!)
    .lt("starts_at", input.to.toUTC().toISO()!)
    .order("starts_at");

  if (error) {
    logError("Failed to load bookings for telegram", {
      profileId: input.profile.id,
      error,
    });

    throw new Error("schedule_unavailable");
  }

  return ((data ?? []) as unknown as BookingRow[]).map((row) =>
    mapBooking(row, input.profile.timezone),
  );
}

export async function getTelegramBooking(input: {
  profile: TelegramLinkedProfile;
  bookingId: string;
}): Promise<TelegramBookingSummary | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("bookings")
    .select(bookingSelect)
    .eq("id", input.bookingId)
    .eq("profile_id", input.profile.id)
    .eq("status", "confirmed")
    .maybeSingle();

  if (error) {
    logError("Failed to load booking for telegram", {
      profileId: input.profile.id,
      bookingId: input.bookingId,
      error,
    });

    return null;
  }

  return data ? mapBooking(data as unknown as BookingRow, input.profile.timezone) : null;
}

export type TelegramCancelResult = "cancelled" | "not_found" | "failed";

// Повторяет cancelBookingByMasterAction: те же поля, те же гарантии
// (отменяется только своя и только активная запись) и то же гашение
// отложенных напоминаний. Отличается лишь тем, кто подтверждён — чат, а не
// сессия, поэтому в аудит уходит отдельный eventType.
export async function cancelTelegramBooking(input: {
  profile: TelegramLinkedProfile;
  bookingId: string;
}): Promise<TelegramCancelResult> {
  const admin = createSupabaseAdminClient();
  const cancelledAt = new Date().toISOString();

  const { data: updatedBooking, error } = await admin
    .from("bookings")
    .update({
      status: "cancelled_by_master",
      cancelled_at: cancelledAt,
    })
    .eq("id", input.bookingId)
    .eq("profile_id", input.profile.id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  if (error) {
    logError("Failed to cancel booking from telegram", {
      profileId: input.profile.id,
      bookingId: input.bookingId,
      error,
    });

    return "failed";
  }

  if (!updatedBooking) {
    return "not_found";
  }

  await cancelQueuedReminderEvents(input.bookingId);

  await admin.from("notification_events").insert(
    buildClientCancelledNotificationEvent({
      profileId: input.profile.id,
      bookingId: input.bookingId,
    }),
  );

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: input.profile.id,
    profileId: input.profile.id,
    workspaceId: input.profile.workspaceId,
    eventType: "booking.cancelled_by_master.telegram",
    targetType: "booking",
    targetId: input.bookingId,
  });

  return "cancelled";
}
