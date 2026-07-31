// Единый источник тарифов: и витрина (лендинг, /pricing), и биллинг с гейтами
// читают отсюда. Строки для витрины и числа для расчётов держим рядом, чтобы
// цена на странице и цена в платеже не разъезжались.

export type PlanId = "solo-basic" | "solo-plus" | "studio";

// Что тариф открывает. Проверяется на сервере через hasCapability
// (src/lib/subscription.ts), а не только прячется в интерфейсе.
export type PlanCapability =
  | "prepayment" // приём предоплаты за услугу через ЮKassa мастера
  | "clientReliability" // рейтинг надёжности клиента по истории визитов
  | "aiConsultation" // мануалы услуг и ответы AI-консультанта клиентам
  | "team"; // общий кабинет команды и сотрудники

export type PricingPlan = {
  id: PlanId;
  title: string;
  priceRub: number;
  period: string;
  description: string;
  features: string[];
  capabilities: readonly PlanCapability[];
  // Сколько активных сотрудников входит в тариф без доплаты.
  includedSeats: number;
  highlighted?: boolean;
};

// Пробный период считается от даты регистрации мастера (profiles.created_at).
export const trialDays = 30;

// Все тарифы оплачиваются периодами по 30 дней, автопродления нет.
export const planPeriodDays = 30;

export const trialOffer = {
  title: "Пробный месяц",
  description:
    "30 дней с момента регистрации сервис работает без ограничений. Карта на этом шаге не нужна.",
};

export const pricingPlans: PricingPlan[] = [
  {
    id: "solo-basic",
    title: "Соло. Базовый",
    priceRub: 690,
    period: "в месяц",
    description: "Одному мастеру, который ведёт запись сам.",
    capabilities: [],
    includedSeats: 0,
    features: [
      "Страница записи: клиент выбирает время без регистрации",
      "Расписание, блокировки и защита от двойной записи",
      "База клиентов и история визитов",
      "SMS клиенту и уведомления мастеру в Telegram",
      "Подарочные сертификаты с QR-кодом",
      "Чаевые через CloudTips",
    ],
  },
  {
    id: "solo-plus",
    title: "Соло. Расширенный",
    priceRub: 1290,
    period: "в месяц",
    description: "Когда клиентов стало больше и неявки начали стоить денег.",
    highlighted: true,
    capabilities: ["prepayment", "clientReliability", "aiConsultation"],
    includedSeats: 0,
    features: [
      "Всё из базового тарифа",
      "Предоплата за услугу через вашу ЮKassa",
      "Рейтинг надёжности клиента по истории визитов",
      "AI-консультант отвечает клиентам по вашим мануалам",
    ],
  },
  {
    id: "studio",
    title: "Студия и барбершоп",
    priceRub: 1990,
    period: "в месяц",
    description: "Общий кабинет на команду, три сотрудника уже включены.",
    capabilities: ["prepayment", "clientReliability", "aiConsultation", "team"],
    includedSeats: 3,
    features: [
      "Всё из расширенного тарифа",
      "У каждого мастера свой кабинет, у администратора — общая картина",
      "Страница компании с выбором мастера и услуги",
      "Клиенты и загрузка команды в одном месте",
    ],
  },
];

export const extraSeatPriceRub = 350;

export const extraSeat = {
  title: "Сотрудник сверх трёх",
  price: `${extraSeatPriceRub} ₽`,
  period: "в месяц за человека",
  description:
    "Доплата к тарифу «Студия и барбершоп», если в команде больше трёх мастеров.",
};

// Сравнительная таблица на витрине. Строки, за которыми стоит серверный гейт,
// выводятся из capabilities — иначе таблица однажды пообещает то, что
// hasCapability не пустит.
export type PlanComparisonValue = boolean | string;

export type PlanComparisonRow = {
  label: string;
  hint?: string;
  values: Record<PlanId, PlanComparisonValue>;
};

export type PlanComparisonGroup = {
  title: string;
  rows: PlanComparisonRow[];
};

const byPlan = (
  resolve: (plan: PricingPlan) => PlanComparisonValue,
): Record<PlanId, PlanComparisonValue> =>
  Object.fromEntries(
    pricingPlans.map((plan) => [plan.id, resolve(plan)]),
  ) as Record<PlanId, PlanComparisonValue>;

const capabilityRow = (
  label: string,
  capability: PlanCapability,
  hint?: string,
): PlanComparisonRow => ({
  label,
  hint,
  values: byPlan((plan) => plan.capabilities.includes(capability)),
});

const everyPlanRow = (label: string, hint?: string): PlanComparisonRow => ({
  label,
  hint,
  values: byPlan(() => true),
});

export const planComparisonGroups: PlanComparisonGroup[] = [
  {
    title: "Запись и расписание",
    rows: [
      everyPlanRow(
        "Страница записи",
        "Клиент выбирает время без регистрации в сервисе",
      ),
      everyPlanRow("Расписание, блокировки и защита от двойной записи"),
      everyPlanRow(
        "Подтверждение телефона клиента",
        "SMS, flash-call или обратный звонок",
      ),
      everyPlanRow(
        "Отмена клиентом по ссылке",
        "До срока, который мастер задаёт сам",
      ),
      everyPlanRow("Напоминание о повторном визите"),
    ],
  },
  {
    title: "Клиенты",
    rows: [
      everyPlanRow("База клиентов и история визитов"),
      capabilityRow(
        "Рейтинг надёжности клиента",
        "clientReliability",
        "Считается по вашим визитам и виден только вам",
      ),
      capabilityRow(
        "AI-консультант для клиентов",
        "aiConsultation",
        "Отвечает строго по вашему мануалу услуги",
      ),
    ],
  },
  {
    title: "Деньги",
    rows: [
      everyPlanRow("Подарочные сертификаты с QR-кодом"),
      everyPlanRow("Чаевые через CloudTips"),
      capabilityRow(
        "Предоплата за услугу",
        "prepayment",
        "Через вашу ЮKassa, деньги идут напрямую вам",
      ),
    ],
  },
  {
    title: "Команда",
    rows: [
      capabilityRow(
        "Общий кабинет команды",
        "team",
        "У каждого мастера свой кабинет, у администратора — общая картина",
      ),
      {
        label: "Сотрудников включено в тариф",
        values: byPlan((plan) =>
          plan.includedSeats > 0 ? String(plan.includedSeats) : false,
        ),
      },
      {
        label: "Сотрудник сверх включённых",
        values: byPlan((plan) =>
          plan.capabilities.includes("team")
            ? `${extraSeatPriceRub} ₽ в месяц`
            : false,
        ),
      },
    ],
  },
  {
    title: "Уведомления",
    rows: [
      everyPlanRow("SMS клиенту о записи, отмене и напоминании"),
      everyPlanRow("Telegram-уведомления мастеру"),
    ],
  },
];

const planById = new Map<PlanId, PricingPlan>(
  pricingPlans.map((plan) => [plan.id, plan]),
);

export const planIds = pricingPlans.map((plan) => plan.id);

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && planById.has(value as PlanId);

export const getPlan = (planId: PlanId) => {
  const plan = planById.get(planId);

  if (!plan) {
    throw new Error(`Неизвестный тариф: ${planId}`);
  }

  return plan;
};

export const formatPlanPrice = (priceRub: number) => `${priceRub} ₽`;

// Стоимость периода: цена тарифа плюс доплата за сотрудников сверх включённых.
export const calculatePlanPriceRub = (planId: PlanId, activeSeats = 0) => {
  const plan = getPlan(planId);
  const paidSeats = Math.max(0, activeSeats - plan.includedSeats);

  return plan.priceRub + paidSeats * extraSeatPriceRub;
};
