import { planPeriodDays } from "@/config/plans";
import { isSmsConfigured, isTelegramConfigured } from "@/lib/env";
import { sendSms } from "@/lib/sms";
import {
  escapeTelegramHtml,
  isTelegramChatUnavailable,
  sendTelegramMessage,
  type TelegramInlineKeyboard,
} from "@/lib/telegram/api";
import { markClientChatUnavailable } from "@/lib/telegram/client-link";
import { markTelegramChatUnavailable } from "@/lib/telegram/link";

export async function sendBookingConfirmationSms(input: {
  phone: string;
  masterName: string;
  serviceTitle: string;
  startsAtLabel: string;
}) {
  if (!isSmsConfigured) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendSms({
    phone: input.phone,
    message: `okno: запись к ${input.masterName} подтверждена. ${input.serviceTitle}, ${input.startsAtLabel}.`,
  });

  return { ok: result.ok, skipped: false as const };
}

export async function sendPhoneVerificationSms(input: {
  phone: string;
  code: string;
}) {
  if (!isSmsConfigured) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendSms({
    phone: input.phone,
    message: `okno: код подтверждения ${input.code}. Никому его не сообщайте.`,
  });

  return { ok: result.ok, skipped: false as const };
}

// Все сообщения мастеру идут через одну функцию: она же решает, что делать,
// когда чат отвечает 403. Пока бота не было, такой ответ означал вечные
// неудачные попытки в очереди; теперь привязка гасится, и очередь перестаёт
// стучаться в мёртвый чат.
async function sendMasterTelegram(
  chatId: string | null,
  text: string,
  keyboard?: TelegramInlineKeyboard,
) {
  if (!isTelegramConfigured || !chatId) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendTelegramMessage({ chatId, text, keyboard });

  if (result.ok) {
    return { ok: true as const, skipped: false as const };
  }

  if (isTelegramChatUnavailable(result)) {
    await markTelegramChatUnavailable({ chatId });

    // Доставлять больше некуда и незачем: событие считается закрытым, а не
    // упавшим, иначе очередь будет ретраить его до исчерпания попыток.
    return { ok: false as const, skipped: true as const };
  }

  return { ok: false as const, skipped: false as const };
}

// Кнопка ведёт в карточку записи прямо в чате — оттуда мастер может её
// отменить, не открывая кабинет. Без bookingId (старые события в очереди)
// сообщение уходит без кнопки.
function bookingKeyboard(bookingId: string | null): TelegramInlineKeyboard | undefined {
  return bookingId
    ? [[{ text: "Открыть запись", callback_data: `bk:${bookingId}` }]]
    : undefined;
}

export async function sendMasterTelegramNotification(input: {
  chatId: string | null;
  clientName: string;
  serviceTitle: string;
  startsAtLabel: string;
  bookingId?: string | null;
}) {
  return sendMasterTelegram(
    input.chatId,
    [
      "<b>Новая запись</b>",
      "",
      `${escapeTelegramHtml(input.clientName)} · ${escapeTelegramHtml(input.serviceTitle)}`,
      escapeTelegramHtml(input.startsAtLabel),
    ].join("\n"),
    bookingKeyboard(input.bookingId ?? null),
  );
}

export async function sendClientReminderSms(input: {
  phone: string;
  masterName: string;
  serviceTitle: string;
  startsAtLabel: string;
}) {
  if (!isSmsConfigured) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendSms({
    phone: input.phone,
    message: `okno: напоминание о записи к ${input.masterName}. ${input.serviceTitle}, ${input.startsAtLabel}.`,
  });

  return { ok: result.ok, skipped: false as const };
}

// Сообщения клиенту. Отдельная функция от мастерской: у клиента нет профиля
// okno, гасить при 403 нужно строки client_telegram_links, а не привязку
// мастера. Всё остальное устроено так же — 403 закрывает событие, а не роняет
// его в бесконечные повторы.
async function sendClientTelegram(
  chatId: string | null,
  text: string,
  keyboard?: TelegramInlineKeyboard,
) {
  if (!isTelegramConfigured || !chatId) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendTelegramMessage({ chatId, text, keyboard });

  if (result.ok) {
    return { ok: true as const, skipped: false as const };
  }

  if (isTelegramChatUnavailable(result)) {
    await markClientChatUnavailable({ chatId });
    return { ok: false as const, skipped: true as const };
  }

  return { ok: false as const, skipped: false as const };
}

// Кнопка ведёт на страницу отмены и переноса — ту же, что в ссылке из записи.
// Telegram принимает в кнопке только https, поэтому в разработке сообщение
// уходит без неё.
function clientBookingKeyboard(input: {
  cancelUrl: string | null;
}): TelegramInlineKeyboard | undefined {
  return input.cancelUrl && input.cancelUrl.startsWith("https://")
    ? [[{ text: "Перенести или отменить", url: input.cancelUrl }]]
    : undefined;
}

export async function sendClientReminderTelegram(input: {
  chatId: string | null;
  masterName: string;
  serviceTitle: string;
  startsAtLabel: string;
  cancelUrl: string | null;
}) {
  return sendClientTelegram(
    input.chatId,
    [
      "<b>Напоминание о визите</b>",
      "",
      `${escapeTelegramHtml(input.serviceTitle)} — ${escapeTelegramHtml(input.masterName)}`,
      escapeTelegramHtml(input.startsAtLabel),
    ].join("\n"),
    clientBookingKeyboard({ cancelUrl: input.cancelUrl }),
  );
}

// То, чего календарь не умеет в принципе: сообщить об отмене после того, как
// клиент уже сохранил визит у себя.
export async function sendClientCancelledTelegram(input: {
  chatId: string | null;
  masterName: string;
  serviceTitle: string;
  startsAtLabel: string;
  bookingUrl: string | null;
}) {
  return sendClientTelegram(
    input.chatId,
    [
      "<b>Запись отменена</b>",
      "",
      `${escapeTelegramHtml(input.serviceTitle)} — ${escapeTelegramHtml(input.masterName)}`,
      escapeTelegramHtml(input.startsAtLabel),
      "",
      "Отменил мастер. Если это неожиданно — свяжись с ним напрямую.",
    ].join("\n"),
    input.bookingUrl && input.bookingUrl.startsWith("https://")
      ? [[{ text: "Выбрать другое время", url: input.bookingUrl }]]
      : undefined,
  );
}

export async function sendRepeatVisitReminderSms(input: {
  phone: string;
  masterName: string;
  serviceTitle: string;
}) {
  if (!isSmsConfigured) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendSms({
    phone: input.phone,
    message: `okno: пора повторить «${input.serviceTitle}» у ${input.masterName}. Запишись на удобное время.`,
  });

  return { ok: result.ok, skipped: false as const };
}

export async function sendMasterReminderTelegram(input: {
  chatId: string | null;
  clientName: string;
  serviceTitle: string;
  startsAtLabel: string;
  bookingId?: string | null;
}) {
  return sendMasterTelegram(
    input.chatId,
    [
      "<b>Скоро визит</b>",
      "",
      `${escapeTelegramHtml(input.clientName)} · ${escapeTelegramHtml(input.serviceTitle)}`,
      escapeTelegramHtml(input.startsAtLabel),
    ].join("\n"),
    bookingKeyboard(input.bookingId ?? null),
  );
}

// ---- Автопродление подписки ----
// Мастер должен узнать о списании до того, как деньги ушли, и сразу после
// того, как что-то сломалось: сумма меняется вместе с числом сотрудников, а
// отвязать карту он может только сам.

// Про длину периода в предупреждении говорим прямо: списание за год крупнее
// месячного в десять раз, и «спишем 6870 ₽» без «за 12 месяцев» читается как
// ошибка.
export async function notifySubscriptionAutopayUpcoming(input: {
  chatId: string | null;
  amountRub: number;
  dateLabel: string;
  periodDays?: number;
}) {
  const periodLabel =
    input.periodDays && input.periodDays > planPeriodDays
      ? ` за ${input.periodDays / planPeriodDays} месяцев`
      : "";

  return sendMasterTelegram(
    input.chatId,
    `Автопродление подписки okno: ${input.dateLabel} спишем ${input.amountRub} ₽${periodLabel} с привязанной карты. Если продлевать не нужно — отключи автопродление в настройках okno.`,
  );
}

export async function notifySubscriptionAutopayCharged(input: {
  chatId: string | null;
  amountRub: number;
  untilLabel: string | null;
}) {
  return sendMasterTelegram(
    input.chatId,
    `Подписка okno продлена: списали ${input.amountRub} ₽${
      input.untilLabel ? `, доступ активен до ${input.untilLabel}` : ""
    }.`,
  );
}

export async function notifySubscriptionAutopayFailed(input: {
  chatId: string | null;
  giveUp: boolean;
  nextAttemptLabel: string | null;
}) {
  const text = input.giveUp
    ? "Не получилось списать оплату подписки okno — автопродление отключено, карта отвязана. Оплати тариф вручную в настройках, иначе страница записи перестанет принимать клиентов."
    : `Не получилось списать оплату подписки okno.${
        input.nextAttemptLabel ? ` Попробуем ещё раз ${input.nextAttemptLabel}.` : ""
      } Проверь карту или оплати тариф вручную в настройках.`;

  return sendMasterTelegram(input.chatId, text);
}

// Мастер отозвал доступ ЮKassa напрямую в личном кабинете ЮKassa, а не через
// кнопку «Отключить» в okno (okno-tz-yookassa-oauth.md, edge case). Платёж по
// его токену начал падать с 401/403 — просим переподключиться, иначе клиенты
// не смогут ни вносить предоплату, ни покупать сертификаты.
export async function notifyMasterYooKassaRevoked(input: { chatId: string | null }) {
  return sendMasterTelegram(
    input.chatId,
    "ЮKassa отключена: доступ к твоему магазину отозван. Клиенты не могут внести предоплату и купить сертификат — переподключи ЮKassa в настройках okno.",
  );
}
