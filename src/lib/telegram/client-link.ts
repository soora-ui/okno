import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DateTime } from "luxon";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTelegramBotUsername } from "@/lib/telegram/api";

// Привязка чата клиента к конкретной записи.
//
// Устроено как мастерская привязка (src/lib/telegram/link.ts), но связывает не
// аккаунт okno, а запись: у клиента аккаунта нет и не будет до личного
// кабинета. Доверие держится на одноразовом короткоживущем токене, который
// клиент переносит со страницы подтверждения в чат нажатием на ссылку.
//
// Префикс "c_" в start-параметре отличает клиентский токен от мастерского:
// оба приходят в один и тот же /start, и перепутать их нельзя.

const linkTokenTtlMinutes = 15;

export const telegramClientLinkTokenTtlMinutes = linkTokenTtlMinutes;
export const telegramClientStartPrefix = "c_";

function hashLinkToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isSameTokenHash(stored: string, candidate: string) {
  const storedBuffer = Buffer.from(stored);
  const candidateBuffer = Buffer.from(candidate);

  return (
    storedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(storedBuffer, candidateBuffer)
  );
}

// Telegram разрешает в start-параметре до 64 символов из [A-Za-z0-9_-].
// base64url от 32 байт даёт 43 символа, с префиксом — 45.
function generateLinkToken() {
  return randomBytes(32).toString("base64url");
}

export type TelegramClientLinkInvite = {
  url: string;
  expiresAtIso: string;
};

export async function createClientLinkInvite(input: {
  bookingId: string;
}): Promise<TelegramClientLinkInvite | null> {
  const botUsername = await getTelegramBotUsername();

  if (!botUsername) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const token = generateLinkToken();
  const expiresAt = DateTime.utc().plus({ minutes: linkTokenTtlMinutes });

  // Прошлые непогашенные токены записи обнуляем: живой должна остаться только
  // последняя выданная ссылка.
  await admin
    .from("telegram_client_link_tokens")
    .delete()
    .eq("booking_id", input.bookingId)
    .is("used_at", null);

  const { error } = await admin.from("telegram_client_link_tokens").insert({
    booking_id: input.bookingId,
    token_hash: hashLinkToken(token),
    expires_at: expiresAt.toISO(),
  });

  if (error) {
    logError("Failed to create client telegram link token", {
      bookingId: input.bookingId,
      error,
    });

    return null;
  }

  return {
    url: `https://t.me/${botUsername}?start=${telegramClientStartPrefix}${token}`,
    expiresAtIso: expiresAt.toISO()!,
  };
}

// Запись глазами клиента: ровно то, что бот показывает в чате после привязки
// и в напоминании. Имени клиента здесь нет намеренно — он и так знает, кто он,
// а лишние персональные данные в чате не нужны.
export type ClientLinkedBooking = {
  bookingId: string;
  profileId: string;
  masterName: string;
  masterUsername: string;
  serviceTitle: string;
  startsAtIso: string;
  timezone: string;
  clientReminderHours: number;
  cancellationToken: string | null;
};

const linkedBookingSelect = `
  id,
  profile_id,
  starts_at,
  status,
  cancellation_token,
  services(title),
  profiles(username, full_name, timezone, client_reminder_hours)
`;

function mapLinkedBooking(row: Record<string, unknown>): ClientLinkedBooking | null {
  // Supabase отдаёт вложенные связи объектом или массивом в зависимости от
  // того, как выведена кардинальность. Приводим оба вида к одному.
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

export type ConsumeClientLinkTokenResult =
  | { status: "linked"; booking: ClientLinkedBooking }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "failed" };

export async function consumeClientLinkToken(input: {
  token: string;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
}): Promise<ConsumeClientLinkTokenResult> {
  const admin = createSupabaseAdminClient();
  const tokenHash = hashLinkToken(input.token);

  const { data: tokenRow, error: tokenError } = await admin
    .from("telegram_client_link_tokens")
    .select("id, booking_id, token_hash, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError) {
    logError("Failed to read client telegram link token", { error: tokenError });
    return { status: "failed" };
  }

  if (!tokenRow || !isSameTokenHash(String(tokenRow.token_hash), tokenHash)) {
    return { status: "invalid" };
  }

  if (tokenRow.used_at) {
    return { status: "invalid" };
  }

  if (DateTime.fromISO(String(tokenRow.expires_at)) <= DateTime.utc()) {
    return { status: "expired" };
  }

  // Гасим токен первым же ходом и только если он ещё не погашен: два быстрых
  // нажатия не должны привязать чат дважды.
  const { data: claimedToken, error: claimError } = await admin
    .from("telegram_client_link_tokens")
    .update({
      used_at: new Date().toISOString(),
      used_by_telegram_user_id: input.telegramUserId,
    })
    .eq("id", tokenRow.id)
    .is("used_at", null)
    .select("id, booking_id")
    .maybeSingle();

  if (claimError) {
    logError("Failed to claim client telegram link token", { error: claimError });
    return { status: "failed" };
  }

  if (!claimedToken) {
    return { status: "invalid" };
  }

  const bookingId = String(claimedToken.booking_id);
  const nowIso = new Date().toISOString();

  // Запись могли привязать к другому чату (клиент открыл ссылку с чужого
  // телефона, потом со своего). Живая привязка у записи одна.
  await admin
    .from("client_telegram_links")
    .update({ unlinked_at: nowIso })
    .eq("booking_id", bookingId)
    .is("unlinked_at", null)
    .neq("telegram_user_id", input.telegramUserId);

  const { error: linkError } = await admin.from("client_telegram_links").insert({
    booking_id: bookingId,
    telegram_user_id: input.telegramUserId,
    chat_id: input.chatId,
    handle: input.handle,
    linked_at: nowIso,
    unlinked_at: null,
  });

  // Повторное нажатие по той же записи с того же аккаунта упирается в
  // частичный unique-индекс. Это не ошибка: привязка уже есть, всё в порядке.
  if (linkError && linkError.code !== "23505") {
    logError("Failed to link client telegram chat", { bookingId, error: linkError });
    return { status: "failed" };
  }

  const booking = await getClientLinkedBooking({ bookingId });

  if (!booking) {
    return { status: "failed" };
  }

  return { status: "linked", booking };
}

export async function getClientLinkedBooking(input: {
  bookingId: string;
}): Promise<ClientLinkedBooking | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("bookings")
    .select(linkedBookingSelect)
    .eq("id", input.bookingId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapLinkedBooking(data as Record<string, unknown>);
}

// Чат, которому нужно доставить сообщение по записи. null — клиент не
// привязывался или отписался, и это нормальный исход, а не сбой.
export async function getClientChatForBooking(input: {
  bookingId: string;
}): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("client_telegram_links")
    .select("chat_id")
    .eq("booking_id", input.bookingId)
    .is("unlinked_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return String(data.chat_id);
}

// Будущие записи чата. На них держатся ответ бота клиенту и /stop: своего
// профиля у клиента нет, и всё, что бот о нём знает, — это его записи.
export async function getClientBookingsByChat(input: {
  telegramUserId: string;
}): Promise<ClientLinkedBooking[]> {
  const admin = createSupabaseAdminClient();

  const { data: linkRows, error: linkError } = await admin
    .from("client_telegram_links")
    .select("booking_id")
    .eq("telegram_user_id", input.telegramUserId)
    .is("unlinked_at", null);

  if (linkError || !linkRows || linkRows.length === 0) {
    return [];
  }

  const { data, error } = await admin
    .from("bookings")
    .select(linkedBookingSelect)
    .in(
      "id",
      linkRows.map((row) => String(row.booking_id)),
    )
    .eq("status", "confirmed")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as Record<string, unknown>[])
    .map(mapLinkedBooking)
    .filter((booking): booking is ClientLinkedBooking => booking !== null);
}

// Был ли этот чат когда-нибудь клиентским — включая погашенные привязки.
//
// Нужно ровно в одном месте: когда показывать нечего. Незнакомый чат получает
// мастерскую подсказку про настройки, а человеку, который просто отписался,
// она непонятна — он никогда не видел кабинета okno и не собирался.
//
// Запрос делается только на этой ветке, а не на каждом сообщении: у активного
// клиента записи находятся раньше и сюда дело не доходит.
export async function hasClientHistory(input: {
  telegramUserId: string;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  const { data: linkRow } = await admin
    .from("client_telegram_links")
    .select("id")
    .eq("telegram_user_id", input.telegramUserId)
    .limit(1)
    .maybeSingle();

  if (linkRow) {
    return true;
  }

  const { data: identityRow } = await admin
    .from("client_telegram_identities")
    .select("id")
    .eq("telegram_user_id", input.telegramUserId)
    .limit(1)
    .maybeSingle();

  return Boolean(identityRow);
}

// Отписка клиента: гасим все его привязки разом. Он не выбирал мастера при
// подключении — не должен выбирать и при отказе.
export async function detachClientTelegramChat(input: {
  telegramUserId: string;
}): Promise<number> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("client_telegram_links")
    .update({ unlinked_at: new Date().toISOString() })
    .eq("telegram_user_id", input.telegramUserId)
    .is("unlinked_at", null)
    .select("id");

  if (error) {
    logError("Failed to detach client telegram chat", { error });
    return 0;
  }

  return (data ?? []).length;
}

// Клиент заблокировал бота: доставка невозможна, привязки гасим по chat_id.
export async function markClientChatUnavailable(input: { chatId: string }) {
  const admin = createSupabaseAdminClient();

  await admin
    .from("client_telegram_links")
    .update({ unlinked_at: new Date().toISOString() })
    .eq("chat_id", input.chatId)
    .is("unlinked_at", null);
}
