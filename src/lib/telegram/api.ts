import { env, isTelegramConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";

// Единая точка обращения к Telegram Bot API. Всё остальное в src/lib/telegram
// ходит только через неё: одно место, где живут таймаут, разбор ответа и
// правило «сеть упала — не роняем запрос мастера».

export type TelegramInlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TelegramInlineKeyboard = TelegramInlineButton[][];

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

export type TelegramCallResult<T> =
  | { ok: true; result: T }
  | { ok: false; skipped: boolean; description: string; errorCode: number | null };

const telegramTimeoutMs = 8000;

export async function callTelegram<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<TelegramCallResult<T>> {
  if (!isTelegramConfigured) {
    return { ok: false, skipped: true, description: "Telegram не настроен.", errorCode: null };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.telegramBotToken}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(telegramTimeoutMs),
      },
    );

    const data = (await response.json().catch(() => null)) as TelegramResponse<T> | null;

    if (!response.ok || !data?.ok) {
      // Токен в URL, поэтому в лог уходит только метод, а не адрес запроса.
      logError("Telegram API call failed", {
        method,
        status: response.status,
        description: data?.description,
      });

      return {
        ok: false,
        skipped: false,
        description: data?.description ?? `HTTP ${response.status}`,
        errorCode: data?.error_code ?? response.status,
      };
    }

    return { ok: true, result: data.result as T };
  } catch (error) {
    logError("Telegram API call threw", { method, error });

    return {
      ok: false,
      skipped: false,
      description: error instanceof Error ? error.message : "Неизвестная ошибка.",
      errorCode: null,
    };
  }
}

// Мастер заблокировал бота или удалил чат: 403 — не ошибка доставки, а сигнал
// «этот chat_id больше не наш». Вызывающий код по нему гасит привязку, чтобы
// очередь уведомлений не долбилась в мёртвый чат до конца времён.
export function isTelegramChatUnavailable<T>(result: TelegramCallResult<T>) {
  if (result.ok || result.skipped) {
    return false;
  }

  return (
    result.errorCode === 403 ||
    /bot was blocked|user is deactivated|chat not found|bot was kicked/i.test(
      result.description,
    )
  );
}

export async function sendTelegramMessage(input: {
  chatId: string;
  text: string;
  keyboard?: TelegramInlineKeyboard;
  disableWebPagePreview?: boolean;
  // Ответом на какое сообщение отправить. Нужно группе поддержки: реплики по
  // одному обращению должны собираться в одну ветку, иначе разговор с
  // мастером рассыпается по чату отдельными сообщениями.
  replyToMessageId?: number;
}) {
  return callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: "HTML",
    link_preview_options: {
      is_disabled: input.disableWebPagePreview ?? true,
    },
    ...(input.replyToMessageId
      ? {
          reply_parameters: {
            message_id: input.replyToMessageId,
            // Исходное сообщение могли удалить — тогда шлём без привязки,
            // а не роняем доставку целиком.
            allow_sending_without_reply: true,
          },
        }
      : {}),
    ...(input.keyboard ? { reply_markup: { inline_keyboard: input.keyboard } } : {}),
  });
}

// Повторное нажатие той же кнопки даёт тот же текст, и Telegram отвечает
// «message is not modified». Для нас это успех: на экране ровно то, что нужно.
export function isTelegramMessageUnchanged<T>(result: TelegramCallResult<T>) {
  return (
    !result.ok && !result.skipped && /message is not modified/i.test(result.description)
  );
}

export async function editTelegramMessageText(input: {
  chatId: string;
  messageId: number;
  text: string;
  keyboard?: TelegramInlineKeyboard;
}) {
  return callTelegram<unknown>("editMessageText", {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    // Пустой массив кнопок — это именно «убрать кнопки», а отсутствие
    // reply_markup оставило бы старые.
    reply_markup: { inline_keyboard: input.keyboard ?? [] },
  });
}

// Всплывающий ответ на нажатие кнопки. Telegram крутит «часики» на кнопке,
// пока не ответишь, поэтому вызывается всегда — даже когда сказать нечего.
export async function answerTelegramCallback(input: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}) {
  return callTelegram<boolean>("answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    ...(input.text ? { text: input.text } : {}),
    ...(input.showAlert ? { show_alert: true } : {}),
  });
}

let cachedBotUsername: string | null = null;

// Имя бота нужно только для ссылки t.me/<bot>?start=…. Берём из переменной
// окружения, иначе один раз спрашиваем у getMe и держим в памяти процесса:
// имя бота меняется вручную в BotFather, инвалидация не нужна.
export async function getTelegramBotUsername() {
  if (env.telegramBotUsername) {
    return env.telegramBotUsername.replace(/^@/, "");
  }

  if (cachedBotUsername) {
    return cachedBotUsername;
  }

  const result = await callTelegram<{ username?: string }>("getMe", {});

  if (!result.ok || !result.result.username) {
    return null;
  }

  cachedBotUsername = result.result.username;

  return cachedBotUsername;
}

// В сообщениях бота — HTML-разметка, а внутрь подставляются имена клиентов и
// названия услуг. Без экранирования имя вида «<Аня>» ломает всё сообщение:
// Telegram отвечает 400 и уведомление просто не доходит.
export function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
