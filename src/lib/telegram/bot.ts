import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import {
  answerTelegramSurvey,
  attachTelegramFeedbackText,
} from "@/lib/feedback/service";
import { env, isSupportEscalationConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { formatPublicProfileLink } from "@/lib/site";
import { applyOperatorReply } from "@/lib/support-assistant/escalation";
import {
  answerTelegramCallback,
  clearChatCommands,
  setChatCommands,
  editTelegramMessageText,
  escapeTelegramHtml,
  isTelegramChatUnavailable,
  isTelegramMessageUnchanged,
  sendTelegramMessage,
  type TelegramInlineKeyboard,
} from "@/lib/telegram/api";
import {
  consumeTelegramLinkToken,
  detachTelegramChat,
  getDetachedProfileByTelegramUser,
  getProfileByTelegramChat,
  markTelegramChatUnavailable,
  restoreTelegramLink,
  telegramLinkTokenTtlMinutes,
  touchTelegramLink,
  type TelegramLinkedProfile,
} from "@/lib/telegram/link";
import {
  detachClientIdentity,
  getClientBookingsByPhoneHash,
  getClientIdentity,
  linkClientIdentityFromContact,
  markClientIdentityUnavailable,
  type TelegramContact,
} from "@/lib/telegram/client-identity";
import {
  consumeClientLinkToken,
  detachClientTelegramChat,
  getClientBookingsByChat,
  hasClientHistory,
  markClientChatUnavailable,
  telegramClientLinkTokenTtlMinutes,
  telegramClientStartPrefix,
  type ClientLinkedBooking,
} from "@/lib/telegram/client-link";
import {
  cancelTelegramBooking,
  getTelegramBooking,
  getTelegramBookingsInRange,
  type TelegramBookingSummary,
} from "@/lib/telegram/schedule";

// Разбор входящих апдейтов и ответы бота.
//
// Бот — второй вход в кабинет, поэтому каждое действие начинается с одного и
// того же вопроса: чей это чат. Ответ даёт только auth_telegram_links; всё,
// что не привязано, получает приглашение подключиться и ничего больше.

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  // Ответ на сообщение бота. В группах с включённым privacy mode это
  // единственный вид сообщений, который бот вообще получает, — на нём и
  // держится ответ оператора в группе поддержки.
  reply_to_message?: { message_id: number };
  // Приходит, когда человек нажал кнопку «поделиться контактом».
  contact?: TelegramContact;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: {
    chat: TelegramChat;
    from?: TelegramUser;
    new_chat_member?: { status?: string };
  };
};

const weekDays = 7;

const appOrigin = env.appUrl.replace(/\/$/, "");
const settingsUrl = `${appOrigin}/settings`;
const scheduleUrl = `${appOrigin}/schedule`;

// Кнопку-ссылку Telegram принимает только на публичный адрес. В разработке
// (http://localhost:3000) сообщение уходит без кнопки, а не падает целиком.
const supportsLinkButtons = appOrigin.startsWith("https://");

const helpText = [
  "<b>Что умеет бот okno</b>",
  "",
  "/today — записи на сегодня",
  "/week — записи на ближайшую неделю",
  "/link — ссылка на твою страницу записи",
  "/stop — отключить уведомления",
  "/help — эта подсказка",
  "",
  "Уведомления о новых записях и напоминания о визитах приходят сюда сами — включать ничего не нужно.",
].join("\n");

// Меню команд мастера. Должно совпадать с helpText: подсказка в чате и список
// по «/» — это одно и то же обещание, и расходиться им нельзя.
export const masterCommands = [
  { command: "today", description: "Записи на сегодня" },
  { command: "week", description: "Записи на неделю" },
  { command: "link", description: "Ссылка на страницу записи" },
  { command: "help", description: "Что умеет бот" },
  { command: "stop", description: "Отключить уведомления" },
];

// Меню клиента. Стоит глобально: клиентов на порядок больше, чем мастеров, и
// человек, впервые открывший бота, — почти наверняка клиент.
export const clientCommands = [
  { command: "help", description: "Мои записи" },
  { command: "stop", description: "Больше не напоминать" },
];

function mainKeyboard(): TelegramInlineKeyboard {
  return [
    [
      { text: "Сегодня", callback_data: "today" },
      { text: "Неделя", callback_data: "week" },
    ],
    ...(supportsLinkButtons ? [[{ text: "Открыть кабинет", url: scheduleUrl }]] : []),
  ];
}

function connectKeyboard(): TelegramInlineKeyboard {
  return supportsLinkButtons
    ? [[{ text: "Открыть настройки okno", url: settingsUrl }]]
    : [];
}

const connectPrompt = [
  "Этот чат ещё не привязан к аккаунту okno.",
  "",
  `Открой <b>Настройки → Запись → Telegram-уведомления</b> и нажми «Подключить» — ссылка действует ${telegramLinkTokenTtlMinutes} минут и вернёт тебя сюда уже привязанным.`,
].join("\n");

// ---- Форматирование ----

function formatTime(value: DateTime) {
  return value.setLocale("ru").toFormat("HH:mm");
}

function formatDayTitle(value: DateTime, today: DateTime) {
  const label = value.setLocale("ru").toFormat("d MMMM, cccc");

  if (value.hasSame(today, "day")) {
    return `Сегодня, ${label}`;
  }

  if (value.hasSame(today.plus({ days: 1 }), "day")) {
    return `Завтра, ${label}`;
  }

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatMoney(value: number | null) {
  return value === null ? "" : `${value.toLocaleString("ru-RU")} ₽`;
}

function bookingLine(booking: TelegramBookingSummary) {
  const price = formatMoney(booking.servicePrice);

  return [
    `<b>${formatTime(booking.startsAt)}–${formatTime(booking.endsAt)}</b>`,
    escapeTelegramHtml(booking.serviceTitle),
    `— ${escapeTelegramHtml(booking.clientName)}`,
    price ? `· ${price}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function bookingsKeyboard(bookings: TelegramBookingSummary[]): TelegramInlineKeyboard {
  // Кнопка на запись — это вход в карточку, где живёт отмена. Больше восьми
  // кнопок в одном сообщении превращаются в стену, поэтому длинный день
  // остаётся списком: карточку можно открыть из уведомления или из кабинета.
  return bookings.slice(0, 8).map((booking) => [
    {
      text: `${formatTime(booking.startsAt)} · ${booking.clientName}`.slice(0, 60),
      callback_data: `bk:${booking.id}`,
    },
  ]);
}

function renderDay(input: {
  bookings: TelegramBookingSummary[];
  day: DateTime;
  today: DateTime;
}) {
  if (input.bookings.length === 0) {
    return `<b>${formatDayTitle(input.day, input.today)}</b>\n\nЗаписей нет — день свободен.`;
  }

  return [
    `<b>${formatDayTitle(input.day, input.today)}</b>`,
    "",
    ...input.bookings.map((booking) => bookingLine(booking)),
  ].join("\n");
}

function renderWeek(input: {
  bookings: TelegramBookingSummary[];
  today: DateTime;
}) {
  if (input.bookings.length === 0) {
    return "<b>Ближайшая неделя</b>\n\nЗаписей пока нет.";
  }

  const byDay = new Map<string, TelegramBookingSummary[]>();

  for (const booking of input.bookings) {
    const key = booking.startsAt.toISODate()!;
    byDay.set(key, [...(byDay.get(key) ?? []), booking]);
  }

  const blocks = [...byDay.entries()].map(([isoDate, dayBookings]) =>
    [
      `<b>${formatDayTitle(DateTime.fromISO(isoDate, { zone: input.today.zone }), input.today)}</b>`,
      ...dayBookings.map((booking) => bookingLine(booking)),
    ].join("\n"),
  );

  return [
    `<b>Ближайшая неделя</b> · записей: ${input.bookings.length}`,
    "",
    ...blocks,
  ].join("\n\n");
}

function renderBookingCard(booking: TelegramBookingSummary, today: DateTime) {
  const price = formatMoney(booking.servicePrice);

  return [
    `<b>${escapeTelegramHtml(booking.serviceTitle)}</b>${price ? ` · ${price}` : ""}`,
    `${formatDayTitle(booking.startsAt, today)}, ${formatTime(booking.startsAt)}–${formatTime(booking.endsAt)}`,
    "",
    `Клиент: ${escapeTelegramHtml(booking.clientName)}`,
    // Телефон Telegram сам делает кликабельным — набрать можно прямо отсюда.
    booking.clientPhone ? `Телефон: ${escapeTelegramHtml(booking.clientPhone)}` : "",
    booking.note ? `Комментарий: ${escapeTelegramHtml(booking.note)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function bookingCardKeyboard(bookingId: string): TelegramInlineKeyboard {
  return [
    [{ text: "Отменить запись", callback_data: `cx:${bookingId}` }],
    [{ text: "← К расписанию", callback_data: "today" }],
  ];
}

// ---- Данные ----

async function loadToday(profile: TelegramLinkedProfile) {
  const today = DateTime.now().setZone(profile.timezone).startOf("day");
  const bookings = await getTelegramBookingsInRange({
    profile,
    from: today,
    to: today.plus({ days: 1 }),
  });

  return { today, bookings };
}

async function loadWeek(profile: TelegramLinkedProfile) {
  const today = DateTime.now().setZone(profile.timezone).startOf("day");
  const bookings = await getTelegramBookingsInRange({
    profile,
    from: today,
    to: today.plus({ days: weekDays }),
  });

  return { today, bookings };
}

// Кабинет читает записи на сервере и кеширует страницы, поэтому отмена из чата
// обязана сбросить те же пути, что и отмена из интерфейса.
function revalidateCabinet(profile: TelegramLinkedProfile) {
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
  revalidatePath("/clients");
  revalidatePath(`/${profile.username}`);
  revalidatePath(`/${profile.username}/book`);
}

// ---- Ответы ----

type BotReply = {
  text: string;
  keyboard?: TelegramInlineKeyboard;
  // Кнопка «поделиться контактом» под полем ввода. Только для клиента и
  // только в момент, когда он открывает список всех своих записей.
  requestContactText?: string;
  // Убрать оставшуюся клавиатуру запроса контакта.
  removeReplyKeyboard?: boolean;
};

async function replyToday(profile: TelegramLinkedProfile): Promise<BotReply> {
  const { today, bookings } = await loadToday(profile);

  return {
    text: renderDay({ bookings, day: today, today }),
    keyboard: [...bookingsKeyboard(bookings), ...mainKeyboard()],
  };
}

async function replyWeek(profile: TelegramLinkedProfile): Promise<BotReply> {
  const { today, bookings } = await loadWeek(profile);

  return {
    text: renderWeek({ bookings, today }),
    keyboard: mainKeyboard(),
  };
}

function replyLink(profile: TelegramLinkedProfile): BotReply {
  const link = formatPublicProfileLink(profile.username);

  return {
    text: [
      "<b>Твоя страница записи</b>",
      "",
      `https://${link}`,
      "",
      "Отправь ссылку клиенту или поставь в шапку профиля.",
    ].join("\n"),
    keyboard: [[{ text: "Открыть страницу", url: `https://${link}` }]],
  };
}

// ---- Клиент ----
//
// У клиента нет аккаунта okno, поэтому бот знает о нём ровно одно: какие
// записи он к себе привязал. Из этого и собран весь клиентский разговор —
// список ближайших визитов и возможность отписаться.

function formatClientBooking(booking: ClientLinkedBooking) {
  const startsAt = DateTime.fromISO(booking.startsAtIso, { zone: "utc" }).setZone(
    booking.timezone,
  );

  return [
    `<b>${escapeTelegramHtml(booking.serviceTitle)}</b> — ${escapeTelegramHtml(booking.masterName)}`,
    startsAt.setLocale("ru").toFormat("d MMMM, HH:mm"),
  ].join("\n");
}

const miniAppUrl = `${appOrigin}/tg`;

function clientKeyboard(bookings: ClientLinkedBooking[]): TelegramInlineKeyboard {
  if (!supportsLinkButtons) {
    return [];
  }

  // Кабинет первой строкой: в нём есть всё то же самое и ещё остальные визиты.
  // Вторая кнопка — прямой путь к переносу ближайшего, то есть к тому, зачем
  // клиент чаще всего сюда и возвращается.
  const next = bookings.find((booking) => booking.cancellationToken);

  return [
    [{ text: "Мои записи", web_app: { url: miniAppUrl } }],
    ...(next?.cancellationToken
      ? [
          [
            {
              text: "Перенести или отменить",
              url: `${appOrigin}/cancel/${next.cancellationToken}`,
            },
          ],
        ]
      : []),
  ];
}

const shareContactText = "Показать все мои записи";

const shareContactPrompt = [
  "Пока я вижу только те записи, которые ты подключил по ссылке.",
  "",
  "Чтобы видеть сразу все свои визиты — у любого мастера okno — поделись номером телефона кнопкой ниже. По нему я найду остальные записи.",
].join("\n");

function clientReply(input: {
  bookings: ClientLinkedBooking[];
  hasIdentity: boolean;
}): BotReply {
  const { bookings, hasIdentity } = input;

  if (bookings.length === 0) {
    return {
      text: [
        "Здесь я напоминаю о визитах к мастерам okno.",
        "",
        hasIdentity
          ? "Ближайших записей нет. Как запишешься — напомню сам, ничего нажимать не нужно."
          : "Ближайших записей нет. Как запишешься — нажми «Напоминать в Telegram» на странице подтверждения.",
      ].join("\n"),
      requestContactText: hasIdentity ? undefined : shareContactText,
    };
  }

  return {
    text: [
      bookings.length === 1 ? "<b>Ближайший визит</b>" : "<b>Ближайшие визиты</b>",
      "",
      bookings.map(formatClientBooking).join("\n\n"),
      "",
      hasIdentity
        ? "Напомню заранее о каждом. Если мастер отменит запись — сразу напишу сюда."
        : "Напомню заранее. Если мастер отменит запись — сразу напишу сюда.",
      ...(hasIdentity ? [] : ["", shareContactPrompt]),
      "",
      "/stop — больше не напоминать",
    ].join("\n"),
    keyboard: hasIdentity ? clientKeyboard(bookings) : undefined,
    requestContactText: hasIdentity ? undefined : shareContactText,
  };
}

// Что ответить чату, в котором нечего показать. Отписавшийся клиент и
// незнакомец выглядят одинаково — ни привязок, ни записей, — но сказать им
// нужно разное: одному про кнопку на странице записи, другому про настройки
// кабинета, которого у него нет.
async function emptyChatReply(telegramUserId: string): Promise<BotReply> {
  if (!(await hasClientHistory({ telegramUserId }))) {
    return { text: connectPrompt, keyboard: connectKeyboard() };
  }

  return {
    text: [
      "Сейчас я ничего не напоминаю.",
      "",
      "Чтобы вернуть напоминания: нажми «Напоминать в Telegram» на странице своей записи — или поделись номером кнопкой ниже, и я найду все твои визиты сам.",
    ].join("\n"),
    requestContactText: shareContactText,
  };
}

// Всё, что бот знает о клиенте: записи по личности, если он поделился
// номером, иначе — только те, что он подключал ссылкой.
async function loadClientState(telegramUserId: string) {
  const identity = await getClientIdentity({ telegramUserId });

  if (identity) {
    return {
      hasIdentity: true,
      bookings: await getClientBookingsByPhoneHash({ phoneHash: identity.phoneHash }),
    };
  }

  return {
    hasIdentity: false,
    bookings: await getClientBookingsByChat({ telegramUserId }),
  };
}

// Человек нажал «поделиться контактом».
async function handleClientContact(input: {
  contact: TelegramContact;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
}): Promise<BotReply> {
  const result = await linkClientIdentityFromContact(input);

  if (result.status === "foreign_contact") {
    return {
      text: "Это чужой контакт. Чтобы найти твои записи, нужен именно твой номер — нажми кнопку «Показать все мои записи», а не пересылай карточку из контактов.",
      requestContactText: shareContactText,
    };
  }

  if (result.status === "invalid") {
    return { text: "Не разобрал номер. Попробуй ещё раз.", requestContactText: shareContactText };
  }

  if (result.status === "failed") {
    return { text: "Не получилось сохранить — попробуй ещё раз через минуту." };
  }

  const bookings = await getClientBookingsByPhoneHash({
    phoneHash: result.identity.phoneHash,
  });

  if (bookings.length === 0) {
    return {
      text: [
        "Готово 👋",
        "",
        "Записей на этот номер пока нет. Как запишешься к любому мастеру okno — напомню сам, ничего нажимать не нужно.",
      ].join("\n"),
      removeReplyKeyboard: true,
    };
  }

  return {
    text: [
      "Готово 👋",
      "",
      bookings.length === 1 ? "<b>Твой визит</b>" : "<b>Твои визиты</b>",
      "",
      bookings.map(formatClientBooking).join("\n\n"),
      "",
      "Напомню заранее о каждом. Если мастер отменит запись — сразу напишу сюда.",
      "",
      "/stop — больше не напоминать",
    ].join("\n"),
    removeReplyKeyboard: true,
  };
}

// Клавиатура запроса контакта и inline-кнопки в одном сообщении не уживаются,
// поэтому вход в кабинет отправляем следом отдельным сообщением.
function miniAppReply(): BotReply | null {
  return supportsLinkButtons
    ? {
        text: "Все визиты, переносы и повторная запись — в одном месте.",
        keyboard: [[{ text: "Мои записи", web_app: { url: miniAppUrl } }]],
      }
    : null;
}

async function handleClientStart(input: {
  token: string;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
}): Promise<BotReply> {
  const result = await consumeClientLinkToken({
    token: input.token,
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    handle: input.handle,
  });

  if (result.status === "linked") {
    const hours = result.booking.clientReminderHours;
    const identity = await getClientIdentity({ telegramUserId: input.telegramUserId });

    return {
      text: [
        "Готово 👋",
        "",
        formatClientBooking(result.booking),
        "",
        hours > 0
          ? `Напомню за ${formatHours(hours)} до визита. Если мастер отменит запись — сразу напишу сюда.`
          : "Если мастер отменит или перенесёт запись — сразу напишу сюда.",
        ...(identity ? [] : ["", shareContactPrompt]),
        "",
        "/stop — больше не напоминать",
      ].join("\n"),
      // Пока личности нет, клавиатура запроса контакта важнее кнопки-ссылки:
      // Telegram пропускает в сообщение только одну из двух.
      keyboard: identity ? clientKeyboard([result.booking]) : undefined,
      requestContactText: identity ? undefined : shareContactText,
    };
  }

  if (result.status === "expired") {
    return {
      text: `Ссылка устарела — она живёт ${telegramClientLinkTokenTtlMinutes} минут. Вернись на страницу записи и нажми «Напоминать в Telegram» ещё раз.`,
    };
  }

  if (result.status === "failed") {
    return { text: "Не получилось подключить — попробуй ещё раз через минуту." };
  }

  return {
    text: "Ссылка уже использована или недействительна. Вернись на страницу записи и нажми «Напоминать в Telegram» ещё раз.",
  };
}

// «за 2 часа», «за сутки» — время до визита словами, а не числом с сокращением.
function formatHours(hours: number) {
  if (hours === 24) {
    return "сутки";
  }

  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}`;
  }

  const rest = hours % 10;
  const teen = hours % 100 >= 11 && hours % 100 <= 14;
  const word = teen || rest === 0 || rest >= 5 ? "часов" : rest === 1 ? "час" : "часа";

  return `${hours} ${word}`;
}

// ---- Команды ----

// Меню мастера ставится при каждой привязке и при каждом /start от уже
// привязанного чата. Повторный вызов ничего не стоит и решает главную
// проблему выкатки: у мастеров, привязавшихся до появления областей, чат
// иначе так и остался бы с клиентским меню.
async function applyMasterCommands(chatId: string) {
  await setChatCommands({ chatId, commands: masterCommands });
}

async function handleStart(input: {
  profile: TelegramLinkedProfile | null;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
  payload: string | null;
}): Promise<BotReply> {
  // Клиентский и мастерский токены приходят в один и тот же /start, различает
  // их префикс. Без него привязка клиента ушла бы в мастерскую ветку и
  // получила бы «ссылка недействительна».
  if (input.payload?.startsWith(telegramClientStartPrefix)) {
    return handleClientStart({
      token: input.payload.slice(telegramClientStartPrefix.length),
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      handle: input.handle,
    });
  }

  if (input.payload) {
    const result = await consumeTelegramLinkToken({
      token: input.payload,
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      handle: input.handle,
    });

    if (result.status === "linked") {
      await applyMasterCommands(input.chatId);

      return {
        text: [
          `Готово, ${escapeTelegramHtml(result.profile.fullName)} 👋`,
          "",
          "Уведомления о новых записях и напоминания о визитах теперь приходят в этот чат.",
          "",
          helpText,
        ].join("\n"),
        keyboard: mainKeyboard(),
      };
    }

    if (result.status === "expired") {
      return {
        text: `Ссылка устарела — она живёт ${telegramLinkTokenTtlMinutes} минут. Открой настройки okno и нажми «Подключить» ещё раз.`,
        keyboard: connectKeyboard(),
      };
    }

    if (result.status === "failed") {
      return { text: "Не получилось подключить — попробуй ещё раз через минуту." };
    }

    return {
      text: "Ссылка уже использована или недействительна. Открой настройки okno и получи новую.",
      keyboard: connectKeyboard(),
    };
  }

  if (input.profile) {
    await applyMasterCommands(input.chatId);

    return {
      text: [
        `С возвращением, ${escapeTelegramHtml(input.profile.fullName)}.`,
        "",
        helpText,
      ].join("\n"),
      keyboard: mainKeyboard(),
    };
  }

  // Клиент вернулся в чат: своего профиля у него нет, и мастерская подсказка
  // про «Настройки → Telegram-уведомления» его только запутает.
  const clientState = await loadClientState(input.telegramUserId);

  if (clientState.hasIdentity || clientState.bookings.length > 0) {
    return clientReply(clientState);
  }

  // Чат уже был привязан, потом мастер нажал /stop или заблокировал бота:
  // возвращаем доставку без похода за новой ссылкой.
  const detached = await getDetachedProfileByTelegramUser({
    telegramUserId: input.telegramUserId,
  });

  if (!detached) {
    return emptyChatReply(input.telegramUserId);
  }

  const restored = await restoreTelegramLink({
    profileId: detached.id,
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    handle: input.handle,
  });

  if (restored) {
    await applyMasterCommands(input.chatId);

    return {
      text: [
        `Уведомления снова включены, ${escapeTelegramHtml(restored.fullName)}.`,
        "",
        helpText,
      ].join("\n"),
      keyboard: mainKeyboard(),
    };
  }

  // Отвязанный мастер нашёлся, но вернуть доставку не вышло — это его чат,
  // и подсказка нужна мастерская.
  return { text: connectPrompt, keyboard: connectKeyboard() };
}

async function handleCommand(input: {
  command: string;
  payload: string | null;
  profile: TelegramLinkedProfile | null;
  telegramUserId: string;
  chatId: string;
  handle: string | null;
}): Promise<BotReply> {
  if (input.command === "start") {
    return handleStart({
      profile: input.profile,
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      handle: input.handle,
      payload: input.payload,
    });
  }

  if (!input.profile) {
    if (input.command === "stop") {
      // Гасим оба вида привязки: и записи, подключённые ссылкой, и личность
      // по телефону. Человек отказывается от напоминаний, а не от одного из
      // способов их получать.
      const detachedBookings = await detachClientTelegramChat({
        telegramUserId: input.telegramUserId,
      });
      const detachedIdentity = await detachClientIdentity({
        telegramUserId: input.telegramUserId,
      });

      return {
        text:
          detachedBookings > 0 || detachedIdentity
            ? "Больше не напоминаю. Если передумаешь — нажми «Напоминать в Telegram» на странице записи."
            : "Напоминаний и так нет.",
        removeReplyKeyboard: true,
      };
    }

    const clientState = await loadClientState(input.telegramUserId);

    if (clientState.hasIdentity || clientState.bookings.length > 0) {
      return clientReply(clientState);
    }

    return emptyChatReply(input.telegramUserId);
  }

  if (input.command === "today") {
    return replyToday(input.profile);
  }

  if (input.command === "week") {
    return replyWeek(input.profile);
  }

  if (input.command === "link") {
    return replyLink(input.profile);
  }

  if (input.command === "stop") {
    const detached = await detachTelegramChat({ profileId: input.profile.id });

    if (detached) {
      await clearChatCommands({ chatId: input.chatId });
    }

    return {
      text: detached
        ? "Уведомления отключены. Напиши /start, когда захочешь включить обратно."
        : "Не получилось отключить уведомления — попробуй ещё раз.",
    };
  }

  return { text: helpText, keyboard: mainKeyboard() };
}

// ---- Кнопки ----

async function handleCallbackData(input: {
  data: string;
  profile: TelegramLinkedProfile;
}): Promise<{ reply: BotReply; toast?: string }> {
  const [action, argument, extra] = input.data.split(":");

  // Ответ на опрос обратной связи: fb:<повод>:<причина>.
  if (action === "fb" && (argument === "trial_ended" || argument === "cancel") && extra) {
    const outcome = await answerTelegramSurvey({
      profileId: input.profile.id,
      kind: argument,
      reason: extra,
    });

    if (outcome === "failed") {
      return {
        reply: { text: "Не получилось записать ответ. Попробуй ещё раз чуть позже." },
        toast: "Ошибка",
      };
    }

    const wantsToStay = extra === "ready" || extra === "forgot";

    return {
      reply: {
        text: wantsToStay
          ? [
              "<b>Отлично!</b>",
              "",
              "Подключить тариф можно в настройках кабинета — онлайн-запись откроется сразу после оплаты.",
            ].join("\n")
          : [
              "<b>Спасибо, записали.</b>",
              "",
              outcome === "duplicate"
                ? "Твой ответ у команды."
                : "Если хочешь — напиши одним сообщением подробнее, что не так. Я передам это команде: так мы быстрее поймём, что исправить.",
            ].join("\n"),
        keyboard:
          wantsToStay && supportsLinkButtons
            ? [[{ text: "Открыть настройки", url: `${settingsUrl}?tab=account` }]]
            : undefined,
      },
      toast: "Спасибо!",
    };
  }

  if (action === "today") {
    return { reply: await replyToday(input.profile) };
  }

  if (action === "week") {
    return { reply: await replyWeek(input.profile) };
  }

  if (action === "bk" && argument) {
    const booking = await getTelegramBooking({
      profile: input.profile,
      bookingId: argument,
    });

    if (!booking) {
      return {
        reply: await replyToday(input.profile),
        toast: "Запись уже неактивна.",
      };
    }

    const today = DateTime.now().setZone(input.profile.timezone).startOf("day");

    return {
      reply: {
        text: renderBookingCard(booking, today),
        keyboard: bookingCardKeyboard(booking.id),
      },
    };
  }

  // Отмена в два шага: у кнопки в Telegram нет состояния «точно?», а отменённую
  // запись обратно не вернуть — слот освобождается и может уйти другому.
  if (action === "cx" && argument) {
    const booking = await getTelegramBooking({
      profile: input.profile,
      bookingId: argument,
    });

    if (!booking) {
      return {
        reply: await replyToday(input.profile),
        toast: "Запись уже неактивна.",
      };
    }

    const today = DateTime.now().setZone(input.profile.timezone).startOf("day");

    return {
      reply: {
        text: [
          renderBookingCard(booking, today),
          "",
          "<b>Отменить эту запись?</b>",
          "Клиент об отмене не узнает автоматически — предупреди его сам.",
        ].join("\n"),
        keyboard: [
          [
            { text: "Да, отменить", callback_data: `cxy:${booking.id}` },
            { text: "Нет", callback_data: `bk:${booking.id}` },
          ],
        ],
      },
    };
  }

  if (action === "cxy" && argument) {
    const result = await cancelTelegramBooking({
      profile: input.profile,
      bookingId: argument,
    });

    if (result === "cancelled") {
      revalidateCabinet(input.profile);

      return {
        reply: await replyToday(input.profile),
        toast: "Запись отменена.",
      };
    }

    return {
      reply: await replyToday(input.profile),
      toast:
        result === "not_found"
          ? "Эта запись уже неактивна."
          : "Не получилось отменить — попробуй в кабинете.",
    };
  }

  return { reply: await replyToday(input.profile) };
}

// ---- Точка входа ----

function parseCommand(text: string) {
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?$/i.exec(text.trim());

  if (!match) {
    return null;
  }

  return {
    command: match[1].toLowerCase(),
    payload: match[2]?.trim() || null,
  };
}

async function deliver(input: {
  chatId: string;
  reply: BotReply;
  editMessageId?: number;
}) {
  // Клавиатуру под полем ввода правкой не поставить: editMessageText принимает
  // только inline. Такой ответ всегда уходит новым сообщением.
  if (input.editMessageId && !input.reply.requestContactText) {
    const edited = await editTelegramMessageText({
      chatId: input.chatId,
      messageId: input.editMessageId,
      text: input.reply.text,
      keyboard: input.reply.keyboard,
    });

    if (edited.ok || isTelegramMessageUnchanged(edited)) {
      return;
    }

    if (isTelegramChatUnavailable(edited)) {
      await markTelegramChatUnavailable({ chatId: input.chatId });
      return;
    }

    // Править можно только свежие сообщения: у старого уведомления кнопка
    // всё ещё живая, а editMessageText по нему уже падает. Отвечаем новым
    // сообщением, чтобы нажатие не осталось без ответа.
  }

  const sent = await sendTelegramMessage({
    chatId: input.chatId,
    text: input.reply.text,
    keyboard: input.reply.keyboard,
    replyKeyboard: input.reply.requestContactText
      ? { requestContactText: input.reply.requestContactText }
      : undefined,
    removeReplyKeyboard: input.reply.removeReplyKeyboard,
  });

  if (isTelegramChatUnavailable(sent)) {
    await markTelegramChatUnavailable({ chatId: input.chatId });
  }
}

// Ответ оператора в группе поддержки. Возвращает true, если сообщение
// разобрано здесь и обычной логике бота его отдавать не нужно.
//
// Три проверки подряд, и все обязательны: чат должен быть тем самым чатом
// поддержки, сообщение — ответом на сообщение бота, а сам ответ — относиться к
// висящему обращению. Всё остальное в группе бота не касается.
async function handleSupportGroupReply(message: TelegramMessage): Promise<boolean> {
  if (!isSupportEscalationConfigured) {
    return false;
  }

  if (String(message.chat.id) !== env.supportTelegramChatId) {
    return false;
  }

  const repliedToMessageId = message.reply_to_message?.message_id;
  const text = message.text?.trim();

  if (!repliedToMessageId || !text) {
    // Сообщение в группе поддержки, но не ответ по обращению. Молчим: группа
    // рабочая, бот в ней не собеседник.
    return true;
  }

  const confirmation = await applyOperatorReply({
    telegramMessageId: repliedToMessageId,
    text,
  });

  if (!confirmation) {
    // Ответ на своё же сообщение, но обращение не найдено или уже закрыто.
    return true;
  }

  await sendTelegramMessage({ chatId: String(message.chat.id), text: confirmation });

  return true;
}

async function handleMessage(message: TelegramMessage) {
  // Только личный чат: в группе бот выдал бы телефоны клиентов всем участникам.
  if (message.chat.type !== "private") {
    return;
  }

  const from = message.from;

  if (!from) {
    return;
  }

  const telegramUserId = String(from.id);
  const chatId = String(message.chat.id);

  // Контакт приходит сообщением без текста, поэтому разбирается до проверки
  // на текст — иначе нажатие кнопки просто терялось бы.
  if (message.contact) {
    await deliver({
      chatId,
      reply: await handleClientContact({
        contact: message.contact,
        telegramUserId,
        chatId,
        handle: from.username ? `@${from.username}` : null,
      }),
    });

    const miniApp = miniAppReply();

    if (miniApp && (await getClientIdentity({ telegramUserId }))) {
      await deliver({ chatId, reply: miniApp });
    }

    return;
  }

  const text = message.text?.trim();

  if (!text) {
    return;
  }

  const profile = await getProfileByTelegramChat({ telegramUserId });

  if (profile) {
    await touchTelegramLink({ telegramUserId });
  }

  const parsed = parseCommand(text);

  if (!parsed) {
    // Подробности к только что выбранной причине в опросе — они уходят
    // команде, а не в меню бота.
    if (profile && (await attachTelegramFeedbackText({ profileId: profile.id, text }))) {
      await deliver({
        chatId,
        reply: { text: "Передал команде okno. Спасибо, что нашёл минуту — это правда помогает." },
      });
      return;
    }

    if (profile) {
      await deliver({ chatId, reply: { text: helpText, keyboard: mainKeyboard() } });
      return;
    }

    const clientState = await loadClientState(telegramUserId);

    await deliver({
      chatId,
      reply:
        clientState.hasIdentity || clientState.bookings.length > 0
          ? clientReply(clientState)
          : await emptyChatReply(telegramUserId),
    });

    return;
  }

  const reply = await handleCommand({
    command: parsed.command,
    payload: parsed.payload,
    profile,
    telegramUserId,
    chatId,
    handle: from.username ? `@${from.username}` : null,
  });

  await deliver({ chatId, reply });
}

async function handleCallbackQuery(query: TelegramCallbackQuery) {
  const chatId = query.message?.chat.id ? String(query.message.chat.id) : null;
  const telegramUserId = String(query.from.id);

  if (!chatId || !query.data) {
    await answerTelegramCallback({ callbackQueryId: query.id });
    return;
  }

  const profile = await getProfileByTelegramChat({ telegramUserId });

  if (!profile) {
    await answerTelegramCallback({
      callbackQueryId: query.id,
      text: "Чат не привязан к аккаунту okno.",
      showAlert: true,
    });

    await deliver({ chatId, reply: { text: connectPrompt, keyboard: connectKeyboard() } });
    return;
  }

  const { reply, toast } = await handleCallbackData({
    data: query.data,
    profile,
  });

  // Ответ на нажатие — раньше правки сообщения: правка это ещё один поход в
  // Telegram, а «часики» на кнопке крутятся, пока не ответишь.
  await answerTelegramCallback({ callbackQueryId: query.id, text: toast });

  await deliver({
    chatId,
    reply,
    editMessageId: query.message?.message_id,
  });
}

// Мастер заблокировал бота или удалил чат — Telegram сообщает об этом
// отдельным апдейтом. Гасим доставку сразу, не дожидаясь падения очереди.
async function handleChatMemberUpdate(update: NonNullable<TelegramUpdate["my_chat_member"]>) {
  const status = update.new_chat_member?.status;

  if (status !== "kicked" && status !== "left") {
    return;
  }

  await markTelegramChatUnavailable({ chatId: String(update.chat.id) });
  await markClientChatUnavailable({ chatId: String(update.chat.id) });
  await markClientIdentityUnavailable({ chatId: String(update.chat.id) });
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  try {
    if (update.message) {
      // Ответ оператора разбирается ДО мастерской логики. Иначе, если чат
      // оператора привязан к его собственному аккаунту okno, reply уедет в
      // parseCommand, не опознается как команда — и бот ответит оператору
      // подсказкой «Что умеет бот», а мастер так и останется без ответа.
      if (await handleSupportGroupReply(update.message)) {
        return;
      }

      await handleMessage(update.message);
      return;
    }

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.my_chat_member) {
      await handleChatMemberUpdate(update.my_chat_member);
    }
  } catch (error) {
    logError("Failed to handle telegram update", {
      updateId: update.update_id,
      error,
    });

    const chatId =
      update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? null;

    if (chatId) {
      await sendTelegramMessage({
        chatId: String(chatId),
        text: "Что-то пошло не так на нашей стороне. Попробуй ещё раз через минуту.",
      });
    }
  }
}
