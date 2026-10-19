// Справочник обратной связи: поводы, причины, подписи. Импортируется и
// сервером, и клиентским UI, и ботом — поэтому без серверных зависимостей.
//
// Причины — фиксированный список кодов, а не свободный текст: по коду
// причины потом считается, почему уходят. Свободный текст идёт рядом, в
// message, и он необязательный.

export const feedbackKinds = [
  "idea",
  "bug",
  "cancel",
  "trial_ending",
  "trial_ended",
  "pulse",
] as const;

export type FeedbackKind = (typeof feedbackKinds)[number];

export const feedbackKindLabels: Record<FeedbackKind, string> = {
  idea: "Идея",
  bug: "Проблема",
  cancel: "Отключение автопродления",
  trial_ending: "Конец пробного периода",
  trial_ended: "Пробный период закончился",
  pulse: "Опрос «если okno исчезнет»",
};

export const feedbackStatuses = ["new", "planned", "done", "declined"] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  new: "Новое",
  planned: "В планах",
  done: "Сделано",
  declined: "Не будем делать",
};

export type FeedbackReason = {
  code: string;
  label: string;
  // Подсказка к полю «подробнее» после выбора причины: спрашиваем то, что
  // по этой причине нужнее всего.
  followUp?: string;
};

// Отключение автопродления.
export const cancelReasons: readonly FeedbackReason[] = [
  { code: "expensive", label: "Дорого" },
  {
    code: "seasonal",
    label: "Сейчас мало клиентов / сезон",
  },
  {
    code: "missing_feature",
    label: "Не хватает функции",
    followUp: "Какой? Опиши, как бы ты ей пользовался",
  },
  {
    code: "competitor",
    label: "Перехожу в другой сервис",
    followUp: "В какой и чем он лучше?",
  },
  {
    code: "broken",
    label: "Что-то не работало",
    followUp: "Что именно сломалось?",
  },
  { code: "pause", label: "Просто беру перерыв" },
  { code: "other", label: "Другое", followUp: "Расскажи, что случилось" },
];

// Оплаченный период закончился, а продления не было — тихий отток. Спрашиваем
// в Telegram теми же причинами, плюс честный вариант «просто забыл».
export const expiredReasons: readonly FeedbackReason[] = [
  { code: "forgot", label: "Забыл продлить" },
  ...cancelReasons.filter((reason) => reason.code !== "pause"),
];

// Пробный период: перед концом спрашиваем «что мешает остаться», после —
// «почему не продолжил». Список один, вопрос разный.
export const trialReasons: readonly FeedbackReason[] = [
  { code: "expensive", label: "Дорого" },
  { code: "no_time", label: "Не успел разобраться" },
  {
    code: "missing_feature",
    label: "Не хватает функции",
    followUp: "Какой?",
  },
  { code: "no_clients", label: "Клиенты не записываются онлайн" },
  { code: "competitor", label: "Пользуюсь другим сервисом", followUp: "Каким?" },
  { code: "ready", label: "Всё нравится, оплачу" },
  { code: "other", label: "Другое", followUp: "Расскажи подробнее" },
];

// Вопрос Шона Эллиса: доля «очень расстроюсь» от 40% и выше означает, что у
// продукта есть ядро, без которого ему не обойтись.
export const pulseOptions: readonly FeedbackReason[] = [
  { code: "very", label: "Очень расстроюсь" },
  { code: "somewhat", label: "Немного расстроюсь" },
  { code: "not", label: "Без разницы" },
];

export const pulseQuestion = "Если бы завтра okno перестал работать — как бы ты это воспринял?";

export function reasonsFor(kind: FeedbackKind): readonly FeedbackReason[] {
  switch (kind) {
    case "cancel":
      return [...cancelReasons, expiredReasons[0]];
    case "trial_ending":
    case "trial_ended":
      return trialReasons;
    case "pulse":
      return pulseOptions;
    default:
      return [];
  }
}

export function reasonLabel(kind: FeedbackKind, code: string | null): string | null {
  if (!code) {
    return null;
  }

  return reasonsFor(kind).find((reason) => reason.code === code)?.label ?? code;
}

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && (feedbackKinds as readonly string[]).includes(value);
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (feedbackStatuses as readonly string[]).includes(value);
}

export const feedbackMessageMaxLength = 2000;

// ---- Частота опросов ----

// Не спрашиваем ни о чём чаще, чем раз в столько дней, сколько бы поводов ни
// совпало. Опрос, который выскакивает каждую неделю, закрывают не читая.
export const promptCooldownDays = 45;
// Первый опрос Эллиса — через столько дней после первой оплаты: мастер
// должен успеть пожить с сервисом, иначе ответ ничего не значит.
export const pulseFirstAfterPaidDays = 14;
// Опрос перед концом пробного периода — за столько дней.
export const trialEndingLeadDays = 2;

// ---- Пауза подписки ----

export const pauseOptions = [
  { days: 14, label: "2 недели" },
  { days: 30, label: "1 месяц" },
  { days: 60, label: "2 месяца" },
  { days: 90, label: "3 месяца" },
] as const;

export const pauseDayOptions: readonly number[] = pauseOptions.map((option) => option.days);
// Суммарно на паузе — не больше стольких дней за последние 365. Иначе пауза
// превращается в бесплатное хранение аккаунта.
export const pauseMaxDaysPerYear = 90;
