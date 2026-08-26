import { env, isEmailConfigured } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";

// Единая точка обращения к Unisender Go. Транспорт — Web API, а не SMTP:
// HTTPS-запрос надёжнее исходящего соединения на 587 порт и сразу возвращает
// job_id, по которому потом опознаются вебхуки.
//
// Важно: HTTP 200 здесь означает «принято в очередь», а не «доставлено».
// Реальный статус приходит вебхуком в /api/webhooks/unisender.

const defaultApiUrl = "https://goapi.unisender.ru/ru/transactional/api/v1";
const requestTimeoutMs = 15000;
// На 429 и 50x повторяем, на остальные 4xx — нет: это ошибка запроса, от
// повторов она не исправится.
const maxAttempts = 3;
const retryDelaysMs = [1000, 2000, 4000];

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  plaintext?: string;
  substitutions?: Record<string, string>;
  tags?: string[];
  metadata?: Record<string, string>;
  idempotenceKey?: string;
  // Служебное письмо: без блока отписки и без трекинга. Требует включения
  // техподдержкой Unisender Go — до этого запрос с такими полями вернёт
  // ошибку, поэтому по умолчанию флаг выключен (см. docs/email-setup.md).
  transactional?: boolean;
};

export type SendEmailResult =
  | {
      ok: true;
      jobId: string;
      emails: string[];
      // Адреса, которые не приняты к отправке, приходят даже при HTTP 200.
      failedEmails?: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
      code?: number;
      failedEmails?: Record<string, string>;
      // Ключ идемпотентности уже использован за последнюю минуту: письмо
      // ушло с прошлой попытки, дублировать не нужно.
      duplicate?: boolean;
    };

type UnisenderResponse = {
  status?: string;
  job_id?: string;
  emails?: string[];
  failed_emails?: Record<string, string>;
  message?: string;
  code?: number;
};

function apiUrl(method: string) {
  const base = (env.unisenderApiUrl || defaultApiUrl).replace(/\/$/, "");

  return `${base}/${method}`;
}

// Имена подстановок Unisender Go: латиница, цифры и «_», первый символ —
// буква. Кириллическая переменная не подставится, письмо уйдёт с «{{Имя}}» в
// тексте, поэтому проверяем до отправки.
const substitutionNamePattern = /^[A-Za-z][A-Za-z0-9_]*$/;

function validate(params: SendEmailParams): string | null {
  if (!params.to.trim()) {
    return "Не указан адрес получателя.";
  }

  if (!params.subject.trim()) {
    return "Не указана тема письма.";
  }

  if (!params.html.trim()) {
    return "Пустое тело письма.";
  }

  const tags = params.tags ?? [];

  if (tags.length > 4) {
    return "Меток больше четырёх — Unisender Go столько не примет.";
  }

  if (tags.some((tag) => tag.length > 50)) {
    return "Метка длиннее 50 символов.";
  }

  if (new Set(tags).size !== tags.length) {
    return "Метки должны быть уникальны.";
  }

  const metadata = Object.entries(params.metadata ?? {});

  if (metadata.length > 10) {
    return "В метаданных больше десяти ключей.";
  }

  for (const [key, value] of metadata) {
    if (key.length > 64) {
      return `Ключ метаданных «${key}» длиннее 64 символов.`;
    }

    if (value.length > 1024) {
      return `Значение метаданных «${key}» длиннее 1024 символов.`;
    }
  }

  for (const name of Object.keys(params.substitutions ?? {})) {
    if (!substitutionNamePattern.test(name)) {
      return `Недопустимое имя подстановки «${name}»: только латиница, цифры и «_», первый символ — буква.`;
    }
  }

  if (params.idempotenceKey && params.idempotenceKey.length > 64) {
    return "Ключ идемпотентности длиннее 64 символов.";
  }

  return null;
}

// Запасной plaintext, если вызывающий код его не передал: письмо без
// текстовой части получает штраф от спам-фильтров. Ссылки при этом теряются,
// поэтому у писем, которые нам важны, plaintext пишется руками в шаблоне.
export function htmlToPlaintext(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(httpStatus: number) {
  return httpStatus === 429 || httpStatus >= 500;
}

// Низкоуровневый вызов метода API. Ретраи живут здесь, потому что причина для
// них одна на все методы: провайдер попросил подождать (429) или у него сбой
// (50x). Отправку это дублировать не должно — от дубля защищает
// idempotence_key, который sendEmail передаёт для событийных писем.
export async function callUnisender(
  method: string,
  payload: Record<string, unknown>,
): Promise<
  | { ok: true; data: UnisenderResponse }
  | { ok: false; error: string; code?: number; httpStatus?: number; data?: UnisenderResponse }
> {
  if (!isEmailConfigured) {
    return { ok: false, error: "Отправка почты не настроена: нет UNISENDER_GO_API_KEY." };
  }

  let lastError = "Не удалось обратиться к Unisender Go.";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(apiUrl(method), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-KEY": env.unisenderApiKey!,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      const data = (await response.json().catch(() => null)) as UnisenderResponse | null;

      if (response.ok && data?.status === "success") {
        return { ok: true, data };
      }

      const message = data?.message ?? `HTTP ${response.status}`;

      if (!shouldRetry(response.status) || attempt === maxAttempts - 1) {
        return {
          ok: false,
          error: message,
          code: data?.code,
          httpStatus: response.status,
          data: data ?? undefined,
        };
      }

      lastError = message;
      logWarn("Unisender Go request retried", {
        method,
        attempt: attempt + 1,
        httpStatus: response.status,
        message,
      });
    } catch (error) {
      // Сеть или таймаут: повторяем на тех же условиях, что и 50x.
      lastError = error instanceof Error ? error.message : "Неизвестная ошибка сети.";

      if (attempt === maxAttempts - 1) {
        logError("Unisender Go request failed", { method, error });

        return { ok: false, error: lastError };
      }

      logWarn("Unisender Go request retried", {
        method,
        attempt: attempt + 1,
        error: lastError,
      });
    }

    await delay(retryDelaysMs[attempt]);
  }

  return { ok: false, error: lastError };
}

// API-код 1573 — «письмо с таким idempotence_key уже отправлялось». Это не
// сбой: значит, прошлая попытка дошла, и повторять не надо.
const duplicateIdempotenceCode = 1573;

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const validationError = validate(params);

  if (validationError) {
    logError("Email rejected before sending", { error: validationError, to: params.to });

    return { ok: false, error: validationError };
  }

  const message: Record<string, unknown> = {
    recipients: [
      {
        email: params.to,
        ...(params.substitutions ? { substitutions: params.substitutions } : {}),
        ...(params.metadata ? { metadata: params.metadata } : {}),
      },
    ],
    body: {
      html: params.html,
      plaintext: params.plaintext?.trim() || htmlToPlaintext(params.html),
    },
    subject: params.subject,
    from_email: env.emailFrom,
    ...(env.emailFromName ? { from_name: env.emailFromName } : {}),
    ...(env.emailReplyTo ? { reply_to: env.emailReplyTo } : {}),
    // «simple» — шаблонизатор по умолчанию, подстановки вида {{name}}.
    template_engine: "simple",
    ...(params.tags?.length ? { tags: params.tags } : {}),
    ...(params.idempotenceKey ? { idempotence_key: params.idempotenceKey } : {}),
    // Эти три поля Unisender Go принимает только у аккаунтов, которым
    // техподдержка разрешила отключать отписку и трекинг. Без разрешения
    // запрос вернёт ошибку, поэтому по умолчанию их нет в теле вовсе.
    ...(params.transactional
      ? { skip_unsubscribe: 1, track_links: 0, track_read: 0 }
      : {}),
  };

  const result = await callUnisender("email/send.json", { message });

  if (!result.ok) {
    const duplicate = result.code === duplicateIdempotenceCode;

    if (!duplicate) {
      logError("Email send failed", {
        to: params.to,
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.error,
      });
    }

    return {
      ok: false,
      error: result.error,
      code: result.code,
      failedEmails: result.data?.failed_emails,
      ...(duplicate ? { duplicate: true } : {}),
    };
  }

  const failedEmails = result.data.failed_emails;

  // Адрес мог не пройти и при успешном ответе — молча это терять нельзя,
  // иначе «письмо отправлено» будет означать «мы его никуда не отдали».
  if (failedEmails && Object.keys(failedEmails).length > 0) {
    logWarn("Email addresses rejected by Unisender Go", {
      jobId: result.data.job_id,
      failedEmails,
    });
  }

  return {
    ok: true,
    jobId: result.data.job_id ?? "",
    emails: result.data.emails ?? [],
    ...(failedEmails ? { failedEmails } : {}),
  };
}
