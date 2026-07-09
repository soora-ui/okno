import { env, isSmsConfigured } from "@/lib/env";
import { logError, logInfo } from "@/lib/observability/logger";

export type SendSmsResult = {
  ok: boolean;
  skipped: boolean;
};

// Единая точка отправки SMS. Основной провайдер — sms.ru (SMSRU_API_ID),
// generic-провайдер через SMS_API_URL/SMS_API_KEY оставлен как запасной путь.
export async function sendSms(input: {
  phone: string;
  message: string;
}): Promise<SendSmsResult> {
  if (!isSmsConfigured) {
    return { ok: false, skipped: true };
  }

  if (env.smsRuApiId) {
    return sendViaSmsRu(input);
  }

  return sendViaGenericApi(input);
}

// sms.ru принимает номер без "+": 79780000000.
function normalizePhoneForSmsRu(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }

  return digits;
}

async function sendViaSmsRu(input: {
  phone: string;
  message: string;
}): Promise<SendSmsResult> {
  const to = normalizePhoneForSmsRu(input.phone);
  const params = new URLSearchParams({
    api_id: env.smsRuApiId!,
    to,
    msg: input.message,
    json: "1",
  });

  if (env.smsRuFrom) {
    params.set("from", env.smsRuFrom);
  }

  // SMSRU_TEST_MODE=1 — имитация отправки на стороне sms.ru, без списания денег.
  if (env.smsRuTestMode === "1") {
    params.set("test", "1");
  }

  try {
    const response = await fetch("https://sms.ru/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      logError("sms.ru request failed", { httpStatus: response.status });
      return { ok: false, skipped: false };
    }

    const payload = (await response.json()) as {
      status?: string;
      status_code?: number;
      status_text?: string;
      sms?: Record<string, { status?: string; status_code?: number; status_text?: string }>;
    };

    const smsStatus = payload.sms?.[to];
    const ok = payload.status === "OK" && smsStatus?.status === "OK";

    if (!ok) {
      logError("sms.ru rejected message", {
        statusCode: smsStatus?.status_code ?? payload.status_code,
        statusText: smsStatus?.status_text ?? payload.status_text,
      });
    }

    return { ok, skipped: false };
  } catch (error) {
    logError("sms.ru request threw", { error });
    return { ok: false, skipped: false };
  }
}

export type VerificationCallResult =
  | { ok: true; code: string }
  | { ok: false };

// Авторизация звонком через sms.ru: клиенту звонят со случайного номера,
// последние 4 цифры этого номера — код подтверждения. Не требует имен
// отправителей и подключения операторов (работает и для крымских номеров).
export async function startVerificationCall(input: {
  phone: string;
  ip: string;
}): Promise<VerificationCallResult> {
  if (!env.smsRuApiId) {
    return { ok: false };
  }

  const params = new URLSearchParams({
    api_id: env.smsRuApiId,
    phone: normalizePhoneForSmsRu(input.phone),
    // sms.ru требует IP клиента для защиты от флуда; "-1" — когда IP
    // локальный или неизвестен.
    ip: input.ip,
    json: "1",
  });

  try {
    const response = await fetch("https://sms.ru/code/call", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      logError("sms.ru code/call request failed", { httpStatus: response.status });
      return { ok: false };
    }

    const payload = (await response.json()) as {
      status?: string;
      status_code?: number;
      status_text?: string;
      code?: string | number;
      call_id?: string;
      cost?: string | number;
      balance?: string | number;
    };

    if (payload.status !== "OK" || payload.code === undefined) {
      logError("sms.ru code/call rejected", {
        status: payload.status,
        statusCode: payload.status_code,
        statusText: payload.status_text,
      });
      return { ok: false };
    }

    // Фиксируем каждый принятый звонок: по call_id можно разбираться
    // с поддержкой sms.ru, если звонок не доходит до клиента.
    logInfo("sms.ru code/call accepted", {
      callId: payload.call_id,
      cost: payload.cost,
      balance: payload.balance,
    });

    return { ok: true, code: String(payload.code) };
  } catch (error) {
    logError("sms.ru code/call threw", { error });
    return { ok: false };
  }
}

export type CallcheckStartResult =
  | { ok: true; checkId: string; callPhone: string; callPhonePretty: string }
  | { ok: false };

// Обратный звонок: sms.ru выдает номер, клиент звонит на него со своего
// телефона, звонок сбрасывается (бесплатно). Работает даже там, где
// операторы режут входящие flash-call (МТС, в т.ч. крымский экс-Win Mobile).
export async function startCallcheck(input: {
  phone: string;
}): Promise<CallcheckStartResult> {
  if (!env.smsRuApiId) {
    return { ok: false };
  }

  const params = new URLSearchParams({
    api_id: env.smsRuApiId,
    phone: normalizePhoneForSmsRu(input.phone),
    json: "1",
  });

  try {
    const response = await fetch("https://sms.ru/callcheck/add", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      logError("sms.ru callcheck/add request failed", { httpStatus: response.status });
      return { ok: false };
    }

    const payload = (await response.json()) as {
      status?: string;
      status_code?: number;
      status_text?: string;
      check_id?: string | number;
      call_phone?: string;
      call_phone_pretty?: string;
    };

    if (payload.status !== "OK" || !payload.check_id || !payload.call_phone) {
      logError("sms.ru callcheck/add rejected", {
        status: payload.status,
        statusCode: payload.status_code,
        statusText: payload.status_text,
      });
      return { ok: false };
    }

    logInfo("sms.ru callcheck started", { checkId: payload.check_id });

    return {
      ok: true,
      checkId: String(payload.check_id),
      callPhone: String(payload.call_phone),
      callPhonePretty: String(payload.call_phone_pretty ?? payload.call_phone),
    };
  } catch (error) {
    logError("sms.ru callcheck/add threw", { error });
    return { ok: false };
  }
}

export type CallcheckStatusResult =
  | { ok: true; confirmed: boolean; expired: boolean }
  | { ok: false };

// check_status: 400 — ждем звонок, 401 — номер подтвержден,
// 402 — время истекло или неверный check_id.
export async function getCallcheckStatus(input: {
  checkId: string;
}): Promise<CallcheckStatusResult> {
  if (!env.smsRuApiId) {
    return { ok: false };
  }

  const params = new URLSearchParams({
    api_id: env.smsRuApiId,
    check_id: input.checkId,
    json: "1",
  });

  try {
    const response = await fetch("https://sms.ru/callcheck/status", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      logError("sms.ru callcheck/status request failed", { httpStatus: response.status });
      return { ok: false };
    }

    const payload = (await response.json()) as {
      status?: string;
      status_code?: number;
      status_text?: string;
      check_status?: string | number;
    };

    if (payload.status !== "OK") {
      logError("sms.ru callcheck/status rejected", {
        status: payload.status,
        statusCode: payload.status_code,
        statusText: payload.status_text,
      });
      return { ok: false };
    }

    const checkStatus = Number(payload.check_status);

    return {
      ok: true,
      confirmed: checkStatus === 401,
      expired: checkStatus === 402,
    };
  } catch (error) {
    logError("sms.ru callcheck/status threw", { error });
    return { ok: false };
  }
}

async function sendViaGenericApi(input: {
  phone: string;
  message: string;
}): Promise<SendSmsResult> {
  try {
    const response = await fetch(env.smsApiUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.smsApiKey}`,
      },
      body: JSON.stringify({
        phone: input.phone,
        message: input.message,
      }),
    });

    return { ok: response.ok, skipped: false };
  } catch {
    return { ok: false, skipped: false };
  }
}
