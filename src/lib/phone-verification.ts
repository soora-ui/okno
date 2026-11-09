import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { DateTime } from "luxon";
import { hashPhone, normalizePhoneDigits } from "@/lib/booking";
import { env, isSmsConfigured, isSupabaseConfigured } from "@/lib/env";
import { sendPhoneVerificationSms } from "@/lib/notifications";
import { getCallcheckStatus, startCallcheck, startVerificationCall } from "@/lib/sms";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Подтверждение по SMS требуем только на рабочем контуре с настроенными SMS:
// в демо и локальной разработке запись проходит без кода.
export const isPhoneVerificationRequired = isSupabaseConfigured && isSmsConfigured;

const CODE_LENGTH = 4;
const CODE_TTL_MINUTES = 10;
// Обратный звонок sms.ru живет 5 минут.
const CALLCHECK_TTL_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;
// Лимиты общие на оба канала (flash-call + обратный звонок).
const MAX_SENDS_PER_PHONE_PER_HOUR = 6;
const MAX_SENDS_PER_IP_PER_HOUR = 15;
const MAX_VERIFY_ATTEMPTS = 5;
// Общий суточный потолок платных отправок (звонок-сброс и SMS) на весь сервис.
// Лимиты на номер и на адрес не спасают от перебора номеров с разных адресов,
// а каждая отправка стоит денег. По умолчанию 500 в сутки: с запасом для
// живых клиентов, но счёт за ночь атаки ограничен. Меняется переменной
// SMS_DAILY_SEND_LIMIT. Бесплатный обратный звонок под потолок не попадает —
// клиент сможет подтвердить номер им, даже если платный канал исчерпан.
const DEFAULT_MAX_PAID_SENDS_PER_DAY = 500;

function getMaxPaidSendsPerDay() {
  const configured = Number(env.smsDailySendLimit ?? "");
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_PAID_SENDS_PER_DAY;
}
const TOKEN_TTL_MINUTES = 30;

function getVerificationSecret() {
  const secret = env.phoneEncryptionSecret;

  if (!secret) {
    throw new Error(
      "Нужен PHONE_ENCRYPTION_SECRET для подтверждения телефонов. Добавь его в .env.local.",
    );
  }

  return secret;
}

function hashVerificationCode(phoneDigits: string, code: string) {
  return createHash("sha256")
    .update(`${getVerificationSecret()}:code:${phoneDigits}:${code}`)
    .digest("hex");
}

function signVerificationToken(input: {
  phoneDigits: string;
  username: string;
  expiresAtEpoch: number;
}) {
  return createHmac("sha256", getVerificationSecret())
    .update(
      `phone-verified:v2:${input.phoneDigits}:${input.username.toLowerCase()}:${input.expiresAtEpoch}`,
    )
    .digest("base64url");
}

// Токен позволяет /api/bookings проверить подтверждение без похода в базу.
// Привязан к username мастера, чтобы подтверждение для одной страницы записи
// нельзя было переиспользовать на странице другого мастера.
export function issuePhoneVerificationToken(input: {
  phone: string;
  username: string;
}) {
  const phoneDigits = normalizePhoneDigits(input.phone);
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + TOKEN_TTL_MINUTES * 60;
  const signature = signVerificationToken({
    phoneDigits,
    username: input.username,
    expiresAtEpoch,
  });

  return `v2.${expiresAtEpoch}.${signature}`;
}

export function isPhoneVerificationTokenValid(input: {
  phone: string;
  username: string;
  token: string;
}) {
  const [version, expiresAtRaw, signature] = input.token.split(".");

  if (version !== "v2" || !expiresAtRaw || !signature) {
    return false;
  }

  const expiresAtEpoch = Number(expiresAtRaw);

  if (!Number.isInteger(expiresAtEpoch) || expiresAtEpoch * 1000 < Date.now()) {
    return false;
  }

  const phoneDigits = normalizePhoneDigits(input.phone);
  const expected = signVerificationToken({
    phoneDigits,
    username: input.username,
    expiresAtEpoch,
  });
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export type VerificationChannel = "call" | "sms";

type SendRateLimitResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds?: number };

// Кулдаун считается отдельно по каналам (flash-call/SMS против обратного
// звонка), чтобы клиент, которому не дозвонились, мог сразу перейти на
// обратный звонок, не выжидая 60 секунд. Часовые лимиты — общие.
async function checkSendRateLimits(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  phoneHash: string;
  ipHash: string;
  kind: "code" | "callcheck";
}): Promise<SendRateLimitResult> {
  const now = DateTime.now().toUTC();
  const hourAgoIso = now.minus({ hours: 1 }).toISO()!;

  const { data: recentRows, error: recentError } = await input.admin
    .from("phone_verification_codes")
    .select("id, created_at, check_id")
    .eq("phone_hash", input.phoneHash)
    .gte("created_at", hourAgoIso)
    .order("created_at", { ascending: false });

  if (recentError) {
    logError("Phone verification: failed to load recent codes", { error: recentError });
    return { ok: false, error: "Не получилось отправить код. Попробуй еще раз." };
  }

  const sameKindRows = (recentRows ?? []).filter((row) =>
    input.kind === "callcheck" ? row.check_id : !row.check_id,
  );
  const lastSentAt = sameKindRows[0]
    ? DateTime.fromISO(String(sameKindRows[0].created_at))
    : null;

  if (lastSentAt) {
    const secondsSinceLastSend = now.diff(lastSentAt.toUTC(), "seconds").seconds;

    if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
      const retryAfterSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
      return {
        ok: false,
        error: `Код уже отправлен. Повторная отправка через ${retryAfterSeconds} с.`,
        retryAfterSeconds,
      };
    }
  }

  if ((recentRows?.length ?? 0) >= MAX_SENDS_PER_PHONE_PER_HOUR) {
    return {
      ok: false,
      error: "Слишком много попыток на этот номер. Попробуй снова через час.",
    };
  }

  const { count: ipCount, error: ipError } = await input.admin
    .from("phone_verification_codes")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", input.ipHash)
    .gte("created_at", hourAgoIso);

  if (ipError) {
    logError("Phone verification: failed to check ip limit", { error: ipError });
    return { ok: false, error: "Не получилось отправить код. Попробуй еще раз." };
  }

  if ((ipCount ?? 0) >= MAX_SENDS_PER_IP_PER_HOUR) {
    return {
      ok: false,
      error: "Слишком много запросов кода. Попробуй снова чуть позже.",
    };
  }

  if (input.kind === "code") {
    const dayAgoIso = now.minus({ hours: 24 }).toISO()!;
    const { count: paidCount, error: paidError } = await input.admin
      .from("phone_verification_codes")
      .select("id", { count: "exact", head: true })
      .is("check_id", null)
      .gte("created_at", dayAgoIso);

    if (paidError) {
      logError("Phone verification: failed to check daily cap", { error: paidError });
      return { ok: false, error: "Не получилось отправить код. Попробуй еще раз." };
    }

    const dailyCap = getMaxPaidSendsPerDay();
    if ((paidCount ?? 0) >= dailyCap) {
      // Ошибка, а не предупреждение: либо идёт перебор номеров, либо сервис
      // вырос и потолок пора поднимать — в обоих случаях это надо увидеть.
      logError("Phone verification: daily paid send cap reached", {
        sentLast24h: paidCount,
        dailyCap,
      });
      return {
        ok: false,
        error:
          "Сейчас не получается отправить код. Попробуй подтвердить номер обратным звонком.",
      };
    }
  }

  return { ok: true };
}

export type RequestCodeResult =
  | { ok: true; retryAfterSeconds: number; channel: VerificationChannel }
  | { ok: false; error: string; retryAfterSeconds?: number };

export async function requestPhoneVerificationCode(input: {
  phone: string;
  ip: string;
  ipHash: string;
}): Promise<RequestCodeResult> {
  const phoneDigits = normalizePhoneDigits(input.phone);
  const phoneHash = hashPhone(phoneDigits);
  const admin = createSupabaseAdminClient();
  const now = DateTime.now().toUTC();

  const rateLimit = await checkSendRateLimits({
    admin,
    phoneHash,
    ipHash: input.ipHash,
    kind: "code",
  });

  if (!rateLimit.ok) {
    return rateLimit;
  }

  // Основной канал — звонок-сброс через sms.ru: код возвращает сам sms.ru
  // (последние 4 цифры звонящего номера), имена отправителей и подключение
  // операторов не нужны. Generic SMS-провайдер остается запасным путем.
  const channel: VerificationChannel = env.smsRuApiId ? "call" : "sms";
  let code: string;

  if (channel === "call") {
    const callResult = await startVerificationCall({
      phone: phoneDigits,
      ip: input.ip,
    });

    if (!callResult.ok) {
      return {
        ok: false,
        error: "Не получилось отправить звонок с кодом. Попробуй еще раз чуть позже.",
      };
    }

    code = callResult.code;
  } else {
    code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
  }

  const { data: insertedRow, error: insertError } = await admin
    .from("phone_verification_codes")
    .insert({
      phone_hash: phoneHash,
      code_hash: hashVerificationCode(phoneDigits, code),
      ip_hash: input.ipHash,
      expires_at: now.plus({ minutes: CODE_TTL_MINUTES }).toISO(),
    })
    .select("id")
    .single();

  if (insertError || !insertedRow) {
    logError("Phone verification: failed to store code", { error: insertError });
    return { ok: false, error: "Не получилось отправить код. Попробуй еще раз." };
  }

  if (channel === "sms") {
    const sendResult = await sendPhoneVerificationSms({ phone: phoneDigits, code });

    if (!sendResult.ok) {
      // Убираем неотправленный код, иначе клиент упрется в кулдаун
      // повторной отправки, хотя SMS так и не ушло.
      await admin.from("phone_verification_codes").delete().eq("id", insertedRow.id);

      return {
        ok: false,
        error: "SMS не дошло до оператора. Проверь номер и попробуй еще раз.",
      };
    }
  }

  return { ok: true, retryAfterSeconds: RESEND_COOLDOWN_SECONDS, channel };
}

export type VerifyCodeResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export type CheckCodeResult = { ok: true } | { ok: false; error: string };

// Токен подтверждения привязан к username мастера — так подтверждение с одной
// страницы записи нельзя переиспользовать на другой. Кабинету клиента мастер
// не нужен: там подтверждается не право записаться, а то, что номер твой.
// Поэтому проверка кода живёт отдельно, а выдача токена надстроена над ней.
export async function checkPhoneVerificationCode(input: {
  phone: string;
  code: string;
}): Promise<CheckCodeResult> {
  const phoneDigits = normalizePhoneDigits(input.phone);
  const phoneHash = hashPhone(phoneDigits);
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: codeRow, error: lookupError } = await admin
    .from("phone_verification_codes")
    .select("id, code_hash, attempts, verified_at, expires_at")
    .eq("phone_hash", phoneHash)
    .not("code_hash", "is", null)
    .gte("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    logError("Phone verification: failed to load code", { error: lookupError });
    return { ok: false, error: "Не получилось проверить код. Попробуй еще раз." };
  }

  if (!codeRow) {
    return {
      ok: false,
      error: "Код устарел или не запрашивался. Отправь новый код.",
    };
  }

  if (Number(codeRow.attempts) >= MAX_VERIFY_ATTEMPTS) {
    return {
      ok: false,
      error: "Слишком много неверных попыток. Отправь новый код.",
    };
  }

  const expectedHash = hashVerificationCode(phoneDigits, input.code.trim());
  const matches = expectedHash === String(codeRow.code_hash);

  const { error: updateError } = await admin
    .from("phone_verification_codes")
    .update({
      attempts: Number(codeRow.attempts) + 1,
      ...(matches ? { verified_at: nowIso } : {}),
    })
    .eq("id", codeRow.id);

  if (updateError) {
    logError("Phone verification: failed to update attempts", { error: updateError });
  }

  if (!matches) {
    return { ok: false, error: "Код не подходит. Проверь цифры и попробуй еще раз." };
  }

  return { ok: true };
}

export async function verifyPhoneVerificationCode(input: {
  phone: string;
  code: string;
  username: string;
}): Promise<VerifyCodeResult> {
  const result = await checkPhoneVerificationCode(input);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    token: issuePhoneVerificationToken({
      phone: normalizePhoneDigits(input.phone),
      username: input.username,
    }),
  };
}

export type RequestCallcheckResult =
  | {
      ok: true;
      callPhone: string;
      callPhonePretty: string;
      retryAfterSeconds: number;
    }
  | { ok: false; error: string; retryAfterSeconds?: number };

// Запасной канал: клиент сам звонит на номер от sms.ru (звонок бесплатный,
// сбрасывается автоматически). Нужен там, где операторы режут входящие
// flash-call — например, крымский МТС (экс-Win Mobile).
export async function requestPhoneCallcheck(input: {
  phone: string;
  ipHash: string;
}): Promise<RequestCallcheckResult> {
  const phoneDigits = normalizePhoneDigits(input.phone);
  const phoneHash = hashPhone(phoneDigits);
  const admin = createSupabaseAdminClient();

  const rateLimit = await checkSendRateLimits({
    admin,
    phoneHash,
    ipHash: input.ipHash,
    kind: "callcheck",
  });

  if (!rateLimit.ok) {
    return rateLimit;
  }

  const started = await startCallcheck({ phone: phoneDigits });

  if (!started.ok) {
    return {
      ok: false,
      error: "Не получилось запустить проверку звонком. Попробуй еще раз чуть позже.",
    };
  }

  const { error: insertError } = await admin.from("phone_verification_codes").insert({
    phone_hash: phoneHash,
    check_id: started.checkId,
    ip_hash: input.ipHash,
    expires_at: DateTime.now()
      .toUTC()
      .plus({ minutes: CALLCHECK_TTL_MINUTES })
      .toISO(),
  });

  if (insertError) {
    logError("Phone verification: failed to store callcheck", { error: insertError });
    return {
      ok: false,
      error: "Не получилось запустить проверку звонком. Попробуй еще раз.",
    };
  }

  return {
    ok: true,
    callPhone: started.callPhone,
    callPhonePretty: started.callPhonePretty,
    retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
  };
}

export type CallcheckPollResult =
  | { ok: true; confirmed: true; token: string }
  | { ok: true; confirmed: false; expired: boolean }
  | { ok: false; error: string };

export type CallcheckStatusResult =
  | { ok: true; confirmed: true }
  | { ok: true; confirmed: false; expired: boolean }
  | { ok: false; error: string };

export async function checkCallcheckStatus(input: {
  phone: string;
}): Promise<CallcheckStatusResult> {
  const phoneDigits = normalizePhoneDigits(input.phone);
  const phoneHash = hashPhone(phoneDigits);
  const admin = createSupabaseAdminClient();

  const { data: row, error: lookupError } = await admin
    .from("phone_verification_codes")
    .select("id, check_id, verified_at, expires_at")
    .eq("phone_hash", phoneHash)
    .not("check_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    logError("Phone verification: failed to load callcheck", { error: lookupError });
    return { ok: false, error: "Не получилось проверить статус. Попробуй еще раз." };
  }

  if (!row) {
    return { ok: false, error: "Проверка звонком не запускалась. Начни заново." };
  }

  if (row.verified_at) {
    return { ok: true, confirmed: true };
  }

  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: true, confirmed: false, expired: true };
  }

  const status = await getCallcheckStatus({ checkId: String(row.check_id) });

  if (!status.ok) {
    return { ok: false, error: "Не получилось проверить статус. Попробуй еще раз." };
  }

  if (status.confirmed) {
    await admin
      .from("phone_verification_codes")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", row.id);

    return { ok: true, confirmed: true };
  }

  return { ok: true, confirmed: false, expired: status.expired };
}

export async function checkPhoneCallcheckStatus(input: {
  phone: string;
  username: string;
}): Promise<CallcheckPollResult> {
  const result = await checkCallcheckStatus({ phone: input.phone });

  if (!result.ok || !result.confirmed) {
    return result;
  }

  return {
    ok: true,
    confirmed: true,
    token: issuePhoneVerificationToken({
      phone: normalizePhoneDigits(input.phone),
      username: input.username,
    }),
  };
}
