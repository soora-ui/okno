import { createHmac, timingSafeEqual } from "node:crypto";

// Письма Supabase Auth (подтверждение почты, сброс пароля, смена адреса)
// отправляет не сам сервер авторизации, а наш маршрут /api/auth/send-email:
// GoTrue вызывает его хуком Send Email и передаёт токен. Так письма идут тем же
// Unisender Go, что и остальные, и выглядят одинаково.
//
// Подпись — по стандарту Standard Webhooks: HMAC-SHA256 от
// `${webhook-id}.${webhook-timestamp}.${тело}` ключом из секрета вида
// "v1,whsec_<base64>" (GOTRUE_HOOK_SEND_EMAIL_SECRETS на сервере авторизации,
// SEND_EMAIL_HOOK_SECRET у приложения).

const maxClockSkewSeconds = 5 * 60;

export type EmailActionType =
  | "signup"
  | "recovery"
  | "email_change"
  | "invite"
  | "magiclink"
  | "reauthentication"
  | "email";

export type SendEmailHookPayload = {
  user: {
    id: string;
    email?: string;
    new_email?: string;
    // Имя кладём сами при регистрации (signUp, options.data.full_name).
    user_metadata?: { full_name?: unknown };
  };
  email_data: {
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to?: string;
    email_action_type: EmailActionType;
    site_url?: string;
  };
};

function secretKey(secret: string) {
  const base64 = secret.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  return Buffer.from(base64, "base64");
}

export function signHookBody(input: {
  secret: string;
  id: string;
  timestamp: string;
  body: string;
}) {
  const digest = createHmac("sha256", secretKey(input.secret))
    .update(`${input.id}.${input.timestamp}.${input.body}`)
    .digest("base64");

  return `v1,${digest}`;
}

export function verifyHookSignature(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
}): boolean {
  if (!input.secret || !input.id || !input.timestamp || !input.signature) {
    return false;
  }

  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > maxClockSkewSeconds) {
    return false;
  }

  const expected = Buffer.from(
    signHookBody({ secret: input.secret, id: input.id, timestamp: input.timestamp, body: input.body }),
  );

  // В заголовке может быть несколько подписей через пробел (смена ключа).
  return input.signature.split(" ").some((candidate) => {
    const actual = Buffer.from(candidate);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

// Типы ссылок, которые умеет подтверждать /auth/confirm.
export type ConfirmLinkType = "signup" | "recovery" | "email_change";

export function isConfirmLinkType(value: unknown): value is ConfirmLinkType {
  return value === "signup" || value === "recovery" || value === "email_change";
}

export function buildConfirmLink(appUrl: string, type: ConfirmLinkType, tokenHash: string) {
  const url = new URL("/auth/confirm", appUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

export type AuthEmailMessage = {
  kind: ConfirmLinkType;
  to: string;
  link: string;
  // Для смены адреса: письмо на прежний адрес или на новый.
  role?: "current" | "new";
  // Имя для обращения: «Анна, остался один шаг». Только первое слово.
  name?: string;
};

// Какие письма отправить по вызову хука. Неизвестные типы (magiclink, invite,
// reauthentication) приложение не использует: вход из Telegram берёт ссылку
// через generateLink, и письмо там не отправляется.
export function planAuthEmails(payload: SendEmailHookPayload, appUrl: string): AuthEmailMessage[] {
  const { user, email_data: data } = payload;
  const type = data.email_action_type;
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  const name = fullName.trim().split(/\s+/)[0]?.slice(0, 40) || undefined;

  if ((type === "signup" || type === "email") && user.email && data.token_hash) {
    return [{ kind: "signup", to: user.email, name, link: buildConfirmLink(appUrl, "signup", data.token_hash) }];
  }

  if (type === "recovery" && user.email && data.token_hash) {
    return [{ kind: "recovery", to: user.email, name, link: buildConfirmLink(appUrl, "recovery", data.token_hash) }];
  }

  if (type === "email_change") {
    // При «безопасной» смене адреса GoTrue ждёт переходов по обеим ссылкам:
    // token_hash уходит на новый адрес, token_hash_new — на прежний. Если
    // включено подтверждение только нового адреса, придёт один token_hash.
    const messages: AuthEmailMessage[] = [];
    if (user.new_email && data.token_hash) {
      messages.push({
        kind: "email_change",
        role: "new",
        to: user.new_email,
        link: buildConfirmLink(appUrl, "email_change", data.token_hash),
      });
    }
    if (user.email && data.token_hash_new) {
      messages.push({
        kind: "email_change",
        role: "current",
        to: user.email,
        link: buildConfirmLink(appUrl, "email_change", data.token_hash_new),
      });
    }
    return messages;
  }

  return [];
}
