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

// Все тарифы оплачиваются периодами по 30 дней. Автопродление есть, но
// подключается только явным согласием мастера при оплате.
export const planPeriodDays = 30;

// Сколько раз подряд пробуем списать по привязанной карте, прежде чем
// выключить автопродление. Знать это должны оба: job — чтобы считать попытки,
// интерфейс — чтобы отличить «мастер отвязал карту сам» от «мы сдались после
// неудачных списаний» и объяснить второе.
export const autopayMaxAttempts = 3;

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
      "Напоминание клиенту в календарь, уведомления мастеру в Telegram",
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

// Есть у частного мастера, но пока не в кабинете студии (горящие окошки и
// источники записей в v1 — только для соло).
const soloOnlyRow = (label: string, hint?: string): PlanComparisonRow => ({
  label,
  hint,
  values: byPlan((plan) => !plan.capabilities.includes("team")),
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
        "Звонок-сброс или обратный звонок",
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
    title: "Привлечение клиентов",
    rows: [
      soloOnlyRow(
        "Горящие окошки для сторис и чатов",
        "Свободное время на три дня: картинка 1080×1920 или готовый текст со ссылкой",
      ),
      soloOnlyRow(
        "Источники записей",
        "Ссылки с меткой для соцсетей и сколько записей дал каждый канал за 30 дней",
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
      everyPlanRow(
        "Напоминание клиенту в календарь",
        "Событие с будильником добавляется в календарь телефона",
      ),
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

// Стоимость одного расчётного периода: цена тарифа плюс доплата за сотрудников
// сверх включённых.
export const calculatePlanPriceRub = (planId: PlanId, activeSeats = 0) => {
  const plan = getPlan(planId);
  const paidSeats = Math.max(0, activeSeats - plan.includedSeats);

  return plan.priceRub + paidSeats * extraSeatPriceRub;
};

// ---- Оплата вперёд ----

// Тариф можно оплатить на несколько расчётных периодов сразу и получить скидку.
// «Месяц» здесь везде означает расчётный период в planPeriodDays дней, а не
// календарный: год — это 12 × 30 = 360 дней. Так же считает и биллинг, поэтому
// цена на витрине и списание совпадают до рубля.
export type BillingPeriodId = "monthly" | "quarter" | "half-year" | "year";

export type BillingPeriod = {
  id: BillingPeriodId;
  months: number;
  days: number;
  // Обещанная скидка. Реальная получается чуть больше из-за округления цены
  // вниз — см. calculatePeriodPriceRub.
  discountPercent: number;
  // Подпись на переключателе периода.
  tabLabel: string;
  // Подпись рядом с ценой: «за 3 месяца».
  priceLabel: string;
};

export const billingPeriods: readonly BillingPeriod[] = [
  {
    id: "monthly",
    months: 1,
    days: planPeriodDays,
    discountPercent: 0,
    tabLabel: "Месяц",
    priceLabel: "в месяц",
  },
  {
    id: "quarter",
    months: 3,
    days: planPeriodDays * 3,
    discountPercent: 5,
    tabLabel: "3 месяца",
    priceLabel: "за 3 месяца",
  },
  {
    id: "half-year",
    months: 6,
    days: planPeriodDays * 6,
    discountPercent: 10,
    tabLabel: "6 месяцев",
    priceLabel: "за 6 месяцев",
  },
  {
    id: "year",
    months: 12,
    days: planPeriodDays * 12,
    discountPercent: 17,
    tabLabel: "12 месяцев",
    priceLabel: "за 12 месяцев",
  },
];

export const defaultBillingPeriodId: BillingPeriodId = "monthly";

const billingPeriodById = new Map<BillingPeriodId, BillingPeriod>(
  billingPeriods.map((period) => [period.id, period]),
);

export const isBillingPeriodId = (value: unknown): value is BillingPeriodId =>
  typeof value === "string" && billingPeriodById.has(value as BillingPeriodId);

export const getBillingPeriod = (periodId: BillingPeriodId) => {
  const period = billingPeriodById.get(periodId);

  if (!period) {
    throw new Error(`Неизвестный период оплаты: ${periodId}`);
  }

  return period;
};

// Период по числу оплаченных дней. Нужен там, где в базе лежит period_days
// (строка платежа, профиль), а показать или посчитать надо именно период.
// Неизвестное число дней — не ошибка: старые платежи писались до появления
// длинных периодов, для них месяц и есть правда.
export const findBillingPeriodByDays = (days: number): BillingPeriod =>
  billingPeriods.find((period) => period.days === days) ??
  getBillingPeriod("monthly");

// Цена без скидки — та самая зачёркнутая сумма на витрине.
export const calculatePeriodFullPriceRub = (
  planId: PlanId,
  periodId: BillingPeriodId,
  activeSeats = 0,
) => calculatePlanPriceRub(planId, activeSeats) * getBillingPeriod(periodId).months;

// Цена со скидкой. Округляем вниз до десятка: 6872,4 ₽ за год — не цена, а
// результат умножения. Округление всегда в пользу мастера, поэтому обещанный
// процент оказывается минимумом, а не приблизительной величиной.
export const calculatePeriodPriceRub = (
  planId: PlanId,
  periodId: BillingPeriodId,
  activeSeats = 0,
) => {
  const period = getBillingPeriod(periodId);
  const full = calculatePeriodFullPriceRub(planId, periodId, activeSeats);

  if (period.discountPercent <= 0) {
    return full;
  }

  return Math.floor((full * (100 - period.discountPercent)) / 1000) * 10;
};

// Скидка, которую видит мастер. Считается от итоговых сумм, а не берётся из
// конфига: иначе «−17 %» на кнопке и разница зачёркнутой и настоящей цены
// разъехались бы на округлении.
export const periodDiscountPercent = (
  planId: PlanId,
  periodId: BillingPeriodId,
  activeSeats = 0,
) => {
  const full = calculatePeriodFullPriceRub(planId, periodId, activeSeats);

  if (full <= 0) {
    return 0;
  }

  const price = calculatePeriodPriceRub(planId, periodId, activeSeats);
  return Math.round((1 - price / full) * 100);
};

// Доплата за сотрудника, добавленного посреди длинного оплаченного периода.
//
// Считается по дням: ставка места за сутки × оставшиеся дни, с той же скидкой,
// что у оплаченного периода — мастер уже купил её вперёд, и место внутри этого
// периода не может стоить дороже. Округление вверх до рубля, потому что ЮKassa
// принимает сумму, а не дробь.
export const calculateSeatTopUpRub = (input: {
  seats: number;
  remainingDays: number;
  discountPercent: number;
}) => {
  const seats = Math.max(0, Math.floor(input.seats));
  const days = Math.max(0, Math.ceil(input.remainingDays));

  if (seats === 0 || days === 0) {
    return 0;
  }

  const perSeatPerDay = extraSeatPriceRub / planPeriodDays;
  const discounted =
    perSeatPerDay * seats * days * ((100 - input.discountPercent) / 100);

  return Math.max(1, Math.ceil(discounted));
};

// За сколько дней до конца периода доплата за место уже не берётся: остаток
// короче расчётного периода, и сотрудник всё равно попадёт в следующий платёж.
// Так помесячная оплата остаётся такой же, какой была, — без внезапных
// доплат посреди месяца.
export const seatTopUpThresholdDays = planPeriodDays;

// За сколько дней предупреждать об автосписании. Живёт здесь, а не в
// серверном subscription-period: те же числа показывает кабинет, а он
// клиентский, и тянуть туда модуль с env нельзя.
//
// У месячной оплаты трёх дней хватает: сумма привычная. У оплаченного вперёд
// периода списание разовое и крупное — про него нужно узнать заранее и успеть
// отвязать карту, если продлевать не собирался.
export const reminderLeadDays = 3;
export const longPeriodReminderLeadDays = 7;
export const maxReminderLeadDays = longPeriodReminderLeadDays;

export const reminderLeadDaysFor = (periodDays: number) =>
  periodDays > planPeriodDays ? longPeriodReminderLeadDays : reminderLeadDays;
