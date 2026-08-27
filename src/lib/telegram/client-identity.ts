import { hashPhone, normalizePhoneDigits } from "@/lib/booking";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClientLinkedBooking } from "@/lib/telegram/client-link";

// Личность клиента: связь telegram-аккаунта с телефоном.
//
// Привязка из client-link.ts работает на одной записи и решает задачу
// напоминания. Здесь другое: узнать, что человек за этим telegram-аккаунтом —
// тот же, что записан у трёх разных мастеров. Связывает их clients.phone_hash,
// детерминированный по построению.
//
// Телефон берём у самого Telegram, а не с формы записи: на форме он мог быть
// чужим (записывают подругу), а кабинет должен показывать только свои визиты.

export type ClientIdentity = {
  telegramUserId: string;
  phoneHash: string;
  chatId: string;
};

// Контакт, присланный в чат. Telegram кладёт user_id только если контакт
// принадлежит telegram-аккаунту; у контакта из адресной книги его нет.
export type TelegramContact = {
  phone_number?: string;
  user_id?: number;
};

export type LinkIdentityResult =
  | { status: "linked"; identity: ClientIdentity }
  | { status: "foreign_contact" }
  | { status: "invalid" }
  | { status: "failed" };

export async function linkClientIdentityFromContact(input: {
  contact: TelegramContact;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
}): Promise<LinkIdentityResult> {
  // Главная проверка всей затеи. Переслать боту чужой контакт можно в два
  // касания, и без этого сравнения любой человек открыл бы кабинет любого
  // другого, зная только его номер. Кнопка «поделиться контактом» присылает
  // контакт с user_id, равным отправителю; всё остальное — не он.
  if (!input.contact.user_id || String(input.contact.user_id) !== input.telegramUserId) {
    return { status: "foreign_contact" };
  }

  const digits = normalizePhoneDigits(input.contact.phone_number ?? "");

  if (digits.length < 10) {
    return { status: "invalid" };
  }

  const phoneHash = hashPhone(digits);
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // Прежняя личность этого аккаунта гасится: человек мог сменить номер, и
  // кабинет должен показывать записи на новый, а не объединять оба.
  const { error: resetError } = await admin
    .from("client_telegram_identities")
    .update({ unlinked_at: nowIso })
    .eq("telegram_user_id", input.telegramUserId)
    .is("unlinked_at", null);

  if (resetError) {
    logError("Failed to reset client telegram identity", { error: resetError });
    return { status: "failed" };
  }

  const { error } = await admin.from("client_telegram_identities").insert({
    telegram_user_id: input.telegramUserId,
    phone_hash: phoneHash,
    chat_id: input.chatId,
    handle: input.handle,
    linked_at: nowIso,
    unlinked_at: null,
  });

  if (error) {
    logError("Failed to link client telegram identity", { error });
    return { status: "failed" };
  }

  return {
    status: "linked",
    identity: { telegramUserId: input.telegramUserId, phoneHash, chatId: input.chatId },
  };
}

export async function getClientIdentity(input: {
  telegramUserId: string;
}): Promise<ClientIdentity | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("client_telegram_identities")
    .select("telegram_user_id, phone_hash, chat_id")
    .eq("telegram_user_id", input.telegramUserId)
    .is("unlinked_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    telegramUserId: String(data.telegram_user_id),
    phoneHash: String(data.phone_hash),
    chatId: String(data.chat_id),
  };
}

// Чат по записи через личность: клиент поделился номером один раз, и с тех
// пор напоминания приходят по любой его записи — нажимать «Напоминать в
// Telegram» на каждой больше не нужно. Именно это бот и обещает в чате.
export async function getClientChatByBookingIdentity(input: {
  bookingId: string;
}): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select("client_id")
    .eq("id", input.bookingId)
    .maybeSingle();

  if (bookingError || !bookingRow?.client_id) {
    return null;
  }

  const { data: clientRow, error: clientError } = await admin
    .from("clients")
    .select("phone_hash")
    .eq("id", String(bookingRow.client_id))
    .maybeSingle();

  // phone_hash может быть пустым у клиентов, заведённых до миграции
  // 202604050001 — тогда через личность их не найти, и это не ошибка.
  if (clientError || !clientRow?.phone_hash) {
    return null;
  }

  const { data, error } = await admin
    .from("client_telegram_identities")
    .select("chat_id")
    .eq("phone_hash", String(clientRow.phone_hash))
    .is("unlinked_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return String(data.chat_id);
}

export async function detachClientIdentity(input: {
  telegramUserId: string;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("client_telegram_identities")
    .update({ unlinked_at: new Date().toISOString() })
    .eq("telegram_user_id", input.telegramUserId)
    .is("unlinked_at", null)
    .select("id");

  if (error) {
    logError("Failed to detach client telegram identity", { error });
    return false;
  }

  return (data ?? []).length > 0;
}

// Клиент заблокировал бота: доставка невозможна ни по одной из дорог.
export async function markClientIdentityUnavailable(input: { chatId: string }) {
  const admin = createSupabaseAdminClient();

  await admin
    .from("client_telegram_identities")
    .update({ unlinked_at: new Date().toISOString() })
    .eq("chat_id", input.chatId)
    .is("unlinked_at", null);
}

// Все будущие визиты человека — у всех мастеров сразу. Это и есть то, чего
// не даёт привязка по записи: два запроса вместо джойна, потому что clients
// и bookings связаны через profile_id, а фильтруем мы по телефону.
export async function getClientBookingsByPhoneHash(input: {
  phoneHash: string;
  includePast?: boolean;
  limit?: number;
}): Promise<ClientLinkedBooking[]> {
  const admin = createSupabaseAdminClient();

  const { data: clientRows, error: clientError } = await admin
    .from("clients")
    .select("id")
    .eq("phone_hash", input.phoneHash);

  if (clientError || !clientRows || clientRows.length === 0) {
    return [];
  }

  let query = admin
    .from("bookings")
    .select(
      "id, profile_id, starts_at, status, cancellation_token, services(title), profiles(username, full_name, timezone, client_reminder_hours)",
    )
    .in(
      "client_id",
      clientRows.map((row) => String(row.id)),
    )
    .limit(input.limit ?? 20);

  query = input.includePast
    ? query.order("starts_at", { ascending: false })
    : query
        .eq("status", "confirmed")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return (data as Record<string, unknown>[])
    .map(mapBookingRow)
    .filter((booking): booking is ClientLinkedBooking => booking !== null);
}

// Тот же разбор вложенных связей, что в client-link.ts: Supabase отдаёт их
// объектом или массивом в зависимости от выведенной кардинальности.
function mapBookingRow(row: Record<string, unknown>): ClientLinkedBooking | null {
  const first = <T,>(value: unknown): T | null =>
    Array.isArray(value) ? ((value[0] as T) ?? null) : ((value as T) ?? null);

  const service = first<{ title?: string }>(row.services);
  const profile = first<{
    username?: string;
    full_name?: string;
    timezone?: string;
    client_reminder_hours?: number;
  }>(row.profiles);

  if (!profile) {
    return null;
  }

  return {
    bookingId: String(row.id),
    profileId: String(row.profile_id),
    masterName: String(profile.full_name ?? ""),
    masterUsername: String(profile.username ?? ""),
    serviceTitle: String(service?.title ?? ""),
    startsAtIso: String(row.starts_at),
    timezone: String(profile.timezone ?? "Europe/Simferopol"),
    clientReminderHours: Number(profile.client_reminder_hours ?? 24),
    cancellationToken: row.cancellation_token ? String(row.cancellation_token) : null,
  };
}
