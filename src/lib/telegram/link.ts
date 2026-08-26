import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DateTime } from "luxon";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTelegramBotUsername } from "@/lib/telegram/api";

// Привязка аккаунта okno к чату Telegram.
//
// Доверие устроено так: сайт знает, кто мастер (сессия), Telegram знает, кто
// пользователь (апдейт). Единственное, что их связывает, — одноразовый токен,
// который мастер переносит из кабинета в чат нажатием на ссылку. Поэтому
// токен короткоживущий, одноразовый и хранится хешем.

const linkTokenTtlMinutes = 15;

export const telegramLinkTokenTtlMinutes = linkTokenTtlMinutes;

function hashLinkToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Токен идёт в start-параметр ссылки: Telegram разрешает там до 64 символов
// из [A-Za-z0-9_-], под это и подобран base64url от 32 случайных байт.
function generateLinkToken() {
  return randomBytes(32).toString("base64url");
}

export type TelegramLinkInvite = {
  token: string;
  url: string;
  expiresAtIso: string;
};

export async function createTelegramLinkInvite(input: {
  profileId: string;
}): Promise<TelegramLinkInvite | null> {
  const botUsername = await getTelegramBotUsername();

  if (!botUsername) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const token = generateLinkToken();
  const expiresAt = DateTime.utc().plus({ minutes: linkTokenTtlMinutes });

  // Прошлые непогашенные токены профиля обнуляем: если мастер открыл настройки
  // трижды, живой должна остаться только последняя ссылка.
  await admin
    .from("telegram_link_tokens")
    .delete()
    .eq("profile_id", input.profileId)
    .is("used_at", null);

  const { error } = await admin.from("telegram_link_tokens").insert({
    profile_id: input.profileId,
    token_hash: hashLinkToken(token),
    expires_at: expiresAt.toISO(),
  });

  if (error) {
    logError("Failed to create telegram link token", {
      profileId: input.profileId,
      error,
    });

    return null;
  }

  return {
    token,
    url: `https://t.me/${botUsername}?start=${token}`,
    expiresAtIso: expiresAt.toISO()!,
  };
}

export type TelegramLinkedProfile = {
  id: string;
  username: string;
  fullName: string;
  timezone: string;
  workspaceId: string | null;
  telegramChatId: string | null;
};

function mapLinkedProfile(row: Record<string, unknown>): TelegramLinkedProfile {
  return {
    id: String(row.id),
    username: String(row.username ?? ""),
    fullName: String(row.full_name ?? ""),
    timezone: String(row.timezone ?? "Europe/Simferopol"),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    telegramChatId: row.telegram_chat_id ? String(row.telegram_chat_id) : null,
  };
}

const linkedProfileColumns =
  "id, username, full_name, timezone, workspace_id, telegram_chat_id";

export type ConsumeLinkTokenResult =
  | { status: "linked"; profile: TelegramLinkedProfile }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "failed" };

export async function consumeTelegramLinkToken(input: {
  token: string;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
}): Promise<ConsumeLinkTokenResult> {
  const admin = createSupabaseAdminClient();
  const tokenHash = hashLinkToken(input.token);

  const { data: tokenRow, error: tokenError } = await admin
    .from("telegram_link_tokens")
    .select("id, profile_id, token_hash, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError) {
    logError("Failed to read telegram link token", { error: tokenError });
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

  // Гасим токен первым же ходом и только если он всё ещё не погашен: два
  // быстрых нажатия на ссылку не должны привязать чат дважды.
  const { data: claimedToken, error: claimError } = await admin
    .from("telegram_link_tokens")
    .update({
      used_at: new Date().toISOString(),
      used_by_telegram_user_id: input.telegramUserId,
    })
    .eq("id", tokenRow.id)
    .is("used_at", null)
    .select("id, profile_id")
    .maybeSingle();

  if (claimError) {
    logError("Failed to claim telegram link token", { error: claimError });
    return { status: "failed" };
  }

  if (!claimedToken) {
    return { status: "invalid" };
  }

  const profileId = String(claimedToken.profile_id);
  const linked = await attachChatToProfile({
    profileId,
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    handle: input.handle,
  });

  if (!linked) {
    return { status: "failed" };
  }

  return { status: "linked", profile: linked };
}

function isSameTokenHash(stored: string, candidate: string) {
  const storedBuffer = Buffer.from(stored);
  const candidateBuffer = Buffer.from(candidate);

  return (
    storedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(storedBuffer, candidateBuffer)
  );
}

async function attachChatToProfile(input: {
  profileId: string;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
}): Promise<TelegramLinkedProfile | null> {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // Этот телеграм-аккаунт мог быть привязан к другому профилю okno. Строка в
  // auth_telegram_links одна на telegram_user_id, поэтому у прежнего профиля
  // сначала выключаем доставку — иначе уведомления продолжат приходить в чат,
  // который ему больше не принадлежит.
  const { data: previousLink } = await admin
    .from("auth_telegram_links")
    .select("profile_id")
    .eq("telegram_user_id", input.telegramUserId)
    .maybeSingle();

  if (previousLink && String(previousLink.profile_id) !== input.profileId) {
    await admin
      .from("profiles")
      .update({ telegram_chat_id: null })
      .eq("id", String(previousLink.profile_id));
  }

  // И наоборот: у профиля мог быть привязан другой чат. Живой чат у профиля
  // ровно один, старые помечаем отвязанными, чтобы они не могли им управлять.
  await admin
    .from("auth_telegram_links")
    .update({ unlinked_at: nowIso })
    .eq("profile_id", input.profileId)
    .is("unlinked_at", null)
    .neq("telegram_user_id", input.telegramUserId);

  const { error: linkError } = await admin.from("auth_telegram_links").upsert(
    {
      profile_id: input.profileId,
      telegram_user_id: input.telegramUserId,
      telegram_handle: input.handle,
      chat_id: input.chatId,
      linked_at: nowIso,
      unlinked_at: null,
      last_seen_at: nowIso,
    },
    { onConflict: "telegram_user_id" },
  );

  if (linkError) {
    logError("Failed to upsert telegram link", {
      profileId: input.profileId,
      error: linkError,
    });

    return null;
  }

  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .update({ telegram_chat_id: input.chatId })
    .eq("id", input.profileId)
    .select(linkedProfileColumns)
    .maybeSingle();

  if (profileError || !profileRow) {
    logError("Failed to store telegram chat id", {
      profileId: input.profileId,
      error: profileError,
    });

    return null;
  }

  return mapLinkedProfile(profileRow);
}

// Профиль, которому принадлежит входящий чат. Вызывается на каждый апдейт,
// поэтому берёт ровно то, что нужно боту для ответа.
export async function getProfileByTelegramChat(input: {
  telegramUserId: string;
}): Promise<TelegramLinkedProfile | null> {
  const admin = createSupabaseAdminClient();

  const { data: linkRow, error: linkError } = await admin
    .from("auth_telegram_links")
    .select("profile_id, unlinked_at")
    .eq("telegram_user_id", input.telegramUserId)
    .maybeSingle();

  if (linkError) {
    logError("Failed to read telegram link", { error: linkError });
    return null;
  }

  if (!linkRow || linkRow.unlinked_at) {
    return null;
  }

  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select(linkedProfileColumns)
    .eq("id", String(linkRow.profile_id))
    .maybeSingle();

  if (profileError || !profileRow) {
    return null;
  }

  return mapLinkedProfile(profileRow);
}

// Отвязанный чат помнит, чей он был: /start без токена возвращает уведомления
// обратно, не гоняя мастера в настройки за новой ссылкой.
export async function getDetachedProfileByTelegramUser(input: {
  telegramUserId: string;
}): Promise<TelegramLinkedProfile | null> {
  const admin = createSupabaseAdminClient();

  const { data: linkRow } = await admin
    .from("auth_telegram_links")
    .select("profile_id, unlinked_at")
    .eq("telegram_user_id", input.telegramUserId)
    .maybeSingle();

  if (!linkRow || !linkRow.unlinked_at) {
    return null;
  }

  const { data: profileRow } = await admin
    .from("profiles")
    .select(linkedProfileColumns)
    .eq("id", String(linkRow.profile_id))
    .maybeSingle();

  return profileRow ? mapLinkedProfile(profileRow) : null;
}

export async function restoreTelegramLink(input: {
  profileId: string;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
}) {
  return attachChatToProfile(input);
}

// Отключение уведомлений. Вызывается и из чата (/stop), и из настроек.
export async function detachTelegramChat(input: { profileId: string }) {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { error: linkError } = await admin
    .from("auth_telegram_links")
    .update({ unlinked_at: nowIso })
    .eq("profile_id", input.profileId)
    .is("unlinked_at", null);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ telegram_chat_id: null })
    .eq("id", input.profileId);

  if (linkError || profileError) {
    logError("Failed to detach telegram chat", {
      profileId: input.profileId,
      error: linkError ?? profileError,
    });

    return false;
  }

  return true;
}

// Мастер заблокировал бота: доставка невозможна, но привязку не стираем —
// разблокирует и нажмёт /start, история чата останется на месте.
export async function markTelegramChatUnavailable(input: { chatId: string }) {
  const admin = createSupabaseAdminClient();

  const { data: profileRows } = await admin
    .from("profiles")
    .update({ telegram_chat_id: null })
    .eq("telegram_chat_id", input.chatId)
    .select("id");

  await admin
    .from("auth_telegram_links")
    .update({ unlinked_at: new Date().toISOString() })
    .eq("chat_id", input.chatId)
    .is("unlinked_at", null);

  return (profileRows ?? []).length;
}

export async function touchTelegramLink(input: { telegramUserId: string }) {
  const admin = createSupabaseAdminClient();

  await admin
    .from("auth_telegram_links")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("telegram_user_id", input.telegramUserId);
}
