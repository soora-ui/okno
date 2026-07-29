import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env, isYooKassaOAuthConfigured } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// OAuth-подключение мастеров к ЮKassa Partners API (okno-tz-yookassa-oauth.md).
// Каждый мастер авторизует okno.business в своём личном аккаунте ЮKassa —
// платежи по предоплате идут напрямую в его магазин через полученный
// access_token, платформа их не касается.
//
// ВАЖНО перед боевым запуском: сверить AUTHORIZE_URL/TOKEN_URL/REVOKE_URL и
// формат ответа /v3/me с актуальной документацией Partners API ЮKassa —
// финальные пути уточняются на этапе регистрации приложения (см. ТЗ).
const AUTHORIZE_URL = "https://yookassa.ru/oauth/v2/authorize";
const TOKEN_URL = "https://yookassa.ru/oauth/v2/token";
const REVOKE_URL = "https://yookassa.ru/oauth/v2/revoke_token";
const ME_URL = "https://api.yookassa.ru/v3/me";

export const yookassaOAuthCallbackPath = "/api/yookassa/oauth/callback";

type SupabaseClient =
  | Awaited<ReturnType<typeof createSupabaseServerClient>>
  | ReturnType<typeof createSupabaseAdminClient>;

export type MasterYooKassaAccount = {
  id: string;
  profileId: string;
  yookassaAccountId: string;
  isTestShop: boolean;
  paymentMethods: string[];
  status: "enabled" | "disabled" | "revoked";
  connectedAt: string;
  revokedAt: string | null;
};

// ---- Токен: AES-256-GCM, отдельный секрет от телефонов клиентов ----

const TOKEN_ENCRYPTION_VERSION = "yke1";

function getTokenKey() {
  const secret = env.yookassaOAuthTokenEncryptionSecret;
  if (!secret) {
    throw new Error(
      "Нужен YOOKASSA_OAUTH_TOKEN_ENCRYPTION_SECRET для шифрования токенов мастеров.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptOAuthToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    TOKEN_ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptOAuthToken(encrypted: string) {
  const [version, ivBase64Url, authTagBase64Url, dataBase64Url] = encrypted.split(":");
  if (version !== TOKEN_ENCRYPTION_VERSION || !ivBase64Url || !authTagBase64Url || !dataBase64Url) {
    throw new Error("Некорректный формат зашифрованного токена ЮKassa.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getTokenKey(),
    Buffer.from(ivBase64Url, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagBase64Url, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataBase64Url, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// ---- OAuth state: подписанный непрозрачный ID мастера (CSRF-защита) ----
// Код авторизации ЮKassa живёт 5 минут — окно state делаем немного шире,
// чтобы не резать легитимные, но чуть более долгие подключения.

const STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret() {
  const secret = env.yookassaOAuthClientSecret;
  if (!secret) {
    throw new Error("Нужен YOOKASSA_OAUTH_CLIENT_SECRET для подписи OAuth state.");
  }
  return secret;
}

function signStatePayload(payload: string) {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function createOAuthState(profileId: string) {
  const payload = `${profileId}.${Date.now()}`;
  const signature = signStatePayload(payload);
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string): { profileId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;

  const [profileId, issuedAtRaw, signature] = parts;
  const payload = `${profileId}.${issuedAtRaw}`;
  const expectedSignature = signStatePayload(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_TTL_MS) {
    return null;
  }

  return { profileId };
}

// ---- Redirect на экран согласия ЮKassa ----

export function buildAuthorizeUrl(state: string) {
  if (!isYooKassaOAuthConfigured) {
    throw new Error(
      "ЮKassa OAuth не настроена: добавь YOOKASSA_OAUTH_CLIENT_ID/SECRET и YOOKASSA_OAUTH_TOKEN_ENCRYPTION_SECRET.",
    );
  }

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.yookassaOAuthClientId!);
  url.searchParams.set("state", state);
  return url.toString();
}

// ---- Обмен code -> access_token ----

type TokenExchangeResult = {
  accessToken: string;
  expiresInSeconds: number | null;
};

export async function exchangeOAuthCode(code: string): Promise<TokenExchangeResult> {
  const authHeader = Buffer.from(
    `${env.yookassaOAuthClientId}:${env.yookassaOAuthClientSecret}`,
  ).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${authHeader}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa OAuth: обмен кода на токен вернул ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };

  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("ЮKassa OAuth: ответ токена без access_token.");
  }

  return {
    accessToken: data.access_token,
    expiresInSeconds: typeof data.expires_in === "number" ? data.expires_in : null,
  };
}

// ---- GET /v3/me с токеном мастера ----

export type YooKassaMe = {
  accountId: string;
  isTest: boolean;
  paymentMethods: string[];
  status: string | null;
};

export async function fetchYooKassaMe(accessToken: string): Promise<YooKassaMe> {
  const response = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa OAuth: /v3/me вернул ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    account_id?: unknown;
    test?: unknown;
    payment_methods?: unknown;
    status?: unknown;
  };

  if (typeof data.account_id !== "string" || !data.account_id) {
    throw new Error("ЮKassa OAuth: /v3/me без account_id.");
  }

  return {
    accountId: data.account_id,
    isTest: data.test === true,
    paymentMethods: Array.isArray(data.payment_methods)
      ? data.payment_methods.filter((item): item is string => typeof item === "string")
      : [],
    status: typeof data.status === "string" ? data.status : null,
  };
}

// ---- Отзыв токена на стороне ЮKassa ----
// Best-effort: если ЮKassa недоступна или уже отозвала токен сама — все равно
// помечаем аккаунт revoked локально (см. вызывающий код), чтобы мастер не
// остался в подвешенном состоянии "подключено".

export async function revokeYooKassaTokenRemote(accessToken: string) {
  const authHeader = Buffer.from(
    `${env.yookassaOAuthClientId}:${env.yookassaOAuthClientSecret}`,
  ).toString("base64");

  try {
    const response = await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authHeader}`,
      },
      body: new URLSearchParams({ access_token: accessToken }).toString(),
    });

    if (!response.ok) {
      logWarn("YooKassa OAuth: revoke_token responded with non-2xx", {
        status: response.status,
      });
    }
  } catch (error) {
    logError("YooKassa OAuth: failed to reach revoke_token endpoint", { error });
  }
}

// ---- Репозиторий master_yookassa_accounts ----
// Все функции принимают клиент явно: коллбэк/настройки работают в контексте
// сессии мастера (RLS), бронирование и вебхук — через service-role клиент
// (см. createSupabaseAdminClient в вызывающем коде).

const ACCOUNT_COLUMNS =
  "id, profile_id, yookassa_account_id, access_token_encrypted, token_expires_at, is_test_shop, payment_methods, status, connected_at, revoked_at";

function mapAccountRow(row: Record<string, unknown>): MasterYooKassaAccount {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    yookassaAccountId: String(row.yookassa_account_id),
    isTestShop: row.is_test_shop === true,
    paymentMethods: Array.isArray(row.payment_methods)
      ? (row.payment_methods as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    status: row.status as MasterYooKassaAccount["status"],
    connectedAt: String(row.connected_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

export async function getMasterYooKassaAccount(
  supabase: SupabaseClient,
  profileId: string,
): Promise<MasterYooKassaAccount | null> {
  const { data, error } = await supabase
    .from("master_yookassa_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    logError("Failed to load master_yookassa_accounts row", { profileId, error });
    return null;
  }

  return data ? mapAccountRow(data as Record<string, unknown>) : null;
}

// Для платежа/вебхука: расшифрованный токен + id аккаунта, только если
// подключение активно (status='enabled'). Токен считается бессрочным, если
// token_expires_at не задан (Partners API ЮKassa обычно не присылает
// expires_in для боевых токенов) — expiry проверяем только когда он есть.
export async function getActiveMasterYooKassaToken(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ accountId: string; accessToken: string } | null> {
  const { data, error } = await supabase
    .from("master_yookassa_accounts")
    .select("id, access_token_encrypted, token_expires_at, status")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    logError("Failed to load master_yookassa_accounts token", { profileId, error });
    return null;
  }

  if (!data || data.status !== "enabled") {
    return null;
  }

  if (data.token_expires_at && new Date(data.token_expires_at as string).getTime() <= Date.now()) {
    return null;
  }

  try {
    return {
      accountId: String(data.id),
      accessToken: decryptOAuthToken(String(data.access_token_encrypted)),
    };
  } catch (error) {
    logError("Failed to decrypt master YooKassa token", { profileId, error });
    return null;
  }
}

export async function upsertMasterYooKassaAccount(
  supabase: SupabaseClient,
  input: {
    profileId: string;
    accountId: string;
    accessToken: string;
    expiresInSeconds: number | null;
    isTestShop: boolean;
    paymentMethods: string[];
  },
) {
  const tokenExpiresAt = input.expiresInSeconds
    ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
    : null;

  const { error } = await supabase.from("master_yookassa_accounts").upsert(
    {
      profile_id: input.profileId,
      yookassa_account_id: input.accountId,
      access_token_encrypted: encryptOAuthToken(input.accessToken),
      token_expires_at: tokenExpiresAt,
      is_test_shop: input.isTestShop,
      payment_methods: input.paymentMethods,
      status: "enabled",
      connected_at: new Date().toISOString(),
      revoked_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );

  if (error) {
    logError("Failed to upsert master_yookassa_accounts row", {
      profileId: input.profileId,
      error,
    });
    throw new Error("Не удалось сохранить подключение ЮKassa.");
  }
}

export async function markMasterYooKassaAccountRevoked(
  supabase: SupabaseClient,
  profileId: string,
) {
  const { error } = await supabase
    .from("master_yookassa_accounts")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  if (error) {
    logError("Failed to mark master_yookassa_accounts revoked", { profileId, error });
  }
}
