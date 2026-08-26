import type { SupabaseClient } from "@supabase/supabase-js";
import { env, isNalogConfigured, nalogAuthMethod } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";
import { NalogClient, deriveNalogDeviceId } from "@/lib/nalog/client";
import { decryptNalogSecret, encryptNalogSecret } from "@/lib/nalog/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";

// Строка состояния подключения к «Моему налогу». Одна на платформу — id
// зарезервирован под будущие аккаунты мастеров, если чеки когда-нибудь начнут
// выбиваться и за них.
export const PLATFORM_NALOG_STATE_ID = "platform";

export const nalogMigrationHint =
  "Таблицы чеков «Моего налога» ещё нет — прогони supabase/migrations/202608060001_nalog_receipts.sql.";

type NalogStateRow = {
  device_id: string;
  refresh_token_encrypted: string | null;
  last_refund_sync_at: string | null;
};

async function loadStateRow(supabase: SupabaseClient): Promise<NalogStateRow | null> {
  const { data, error } = await supabase
    .from("nalog_sync_state")
    .select("device_id, refresh_token_encrypted, last_refund_sync_at")
    .eq("id", PLATFORM_NALOG_STATE_ID)
    .maybeSingle();

  if (error) {
    if (isSupabaseMissingTableError(error, "nalog_sync_state")) {
      throw new Error(nalogMigrationHint);
    }
    throw new Error(`Не удалось прочитать состояние «Моего налога»: ${error.message}`);
  }

  return (data as NalogStateRow | null) ?? null;
}

// Строка создаётся при первом обращении. deviceId берём из NALOG_DEVICE_ID,
// если он задан (сценарий переезда: идентификатор вытащили из браузера вместе
// с refreshToken, и менять его нельзя — сессия к нему привязана), иначе
// считаем от ИНН.
async function ensureStateRow(supabase: SupabaseClient): Promise<NalogStateRow> {
  const existing = await loadStateRow(supabase);
  if (existing) {
    return existing;
  }

  const deviceId = env.nalogDeviceId?.trim() || deriveNalogDeviceId(env.nalogInn!);
  const refreshTokenEncrypted =
    nalogAuthMethod === "refresh" && env.nalogRefreshToken
      ? encryptNalogSecret(env.nalogRefreshToken)
      : null;

  const { error } = await supabase.from("nalog_sync_state").insert({
    id: PLATFORM_NALOG_STATE_ID,
    device_id: deviceId,
    refresh_token_encrypted: refreshTokenEncrypted,
  });

  // Гонка двух параллельных прогонов job — строку успел вставить сосед.
  if (error && error.code !== "23505") {
    throw new Error(`Не удалось создать состояние «Моего налога»: ${error.message}`);
  }

  return (
    (await loadStateRow(supabase)) ?? {
      device_id: deviceId,
      refresh_token_encrypted: refreshTokenEncrypted,
      last_refund_sync_at: null,
    }
  );
}

function readRefreshToken(row: NalogStateRow): string | null {
  if (!row.refresh_token_encrypted) {
    // База пуста — первый вход идёт по значению из .env.
    return env.nalogRefreshToken?.trim() || null;
  }

  try {
    return decryptNalogSecret(row.refresh_token_encrypted);
  } catch (error) {
    // Сменили NALOG_ENCRYPTION_SECRET: сохранённый токен больше не читается.
    // Откатываемся на .env, чтобы вход был возможен без похода в базу.
    logError("Nalog: failed to decrypt stored refresh token", { error });
    return env.nalogRefreshToken?.trim() || null;
  }
}

// Клиент кабинета, готовый к работе: с deviceId из базы и живым refreshToken.
// Каждый вызов создаёт новый экземпляр — токен доступа кешируется внутри него
// на время прогона job, дольше держать его в памяти незачем.
export async function createPlatformNalogClient(
  supabase: SupabaseClient = createSupabaseAdminClient(),
) {
  if (!isNalogConfigured) {
    throw new Error(
      "«Мой налог» не настроен: добавь NALOG_INN и NALOG_PASSWORD (или NALOG_AUTH_METHOD=refresh с NALOG_REFRESH_TOKEN).",
    );
  }

  const row = await ensureStateRow(supabase);

  return new NalogClient({
    inn: env.nalogInn!.trim(),
    authMethod: nalogAuthMethod,
    password: env.nalogPassword ?? null,
    refreshToken: readRefreshToken(row),
    deviceId: row.device_id,
    proxyUrl: env.nalogProxyUrl?.trim() || null,
    onRefreshToken: async (token) => {
      // Токен, выданный взамен использованного. Записать его нужно раньше, чем
      // произойдёт следующий вход, иначе кабинет отвергнет мёртвый.
      const { error } = await supabase
        .from("nalog_sync_state")
        .update({
          refresh_token_encrypted: encryptNalogSecret(token),
          last_authenticated_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", PLATFORM_NALOG_STATE_ID);

      if (error) {
        // Потеря токена означает ручную перенастройку — про это надо знать.
        logError("Nalog: failed to persist rotated refresh token", { error });
      }
    },
  });
}

export async function readNalogRefundCursor(supabase: SupabaseClient) {
  const row = await ensureStateRow(supabase);
  return row.last_refund_sync_at;
}

export async function writeNalogRefundCursor(supabase: SupabaseClient, cursor: string) {
  const { error } = await supabase
    .from("nalog_sync_state")
    .update({ last_refund_sync_at: cursor, updated_at: new Date().toISOString() })
    .eq("id", PLATFORM_NALOG_STATE_ID);

  if (error) {
    logWarn("Nalog: failed to persist refund cursor", { error });
  }
}

export async function writeNalogLastError(
  supabase: SupabaseClient,
  message: string | null,
) {
  await supabase
    .from("nalog_sync_state")
    .update({ last_error: message, updated_at: new Date().toISOString() })
    .eq("id", PLATFORM_NALOG_STATE_ID);
}
