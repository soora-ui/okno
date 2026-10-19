// Разрешение тарифа мастера. Импортируется и сервером, и клиентским UI.
//
// Доступ бывает трёх видов:
//   • оплаченный тариф — subscription_tier хранит PlanId, срок в subscription_until;
//   • пробный период — 30 дней от даты регистрации, тариф не оплачен;
//   • нет доступа — пробный период истёк, оплаты нет;
//   • пауза — оплаченный тариф заморожен до subscription_paused_until: запись
//     у клиентов закрыта, оплаченные дни сдвинуты вперёд и не сгорают.
// В пробном периоде открыты все возможности: он для того и нужен, чтобы мастер
// посмотрел сервис целиком.

import {
  type PlanCapability,
  type PlanId,
  getPlan,
  isPlanId,
  planPeriodDays,
  trialDays,
} from "@/config/plans";

export { planPeriodDays };

export type SubscriptionInput = {
  subscriptionTier: string;
  subscriptionUntil: string | null;
  // profiles.created_at — точка отсчёта пробного периода. Если дата не пришла
  // (например, колонку не выбрали в запросе), пробный период не начисляем.
  joinedAt?: string | null;
  // Конец паузы подписки. Пока он в будущем, доступа нет, но и тариф не
  // потерян — после паузы всё включается само.
  subscriptionPausedUntil?: string | null;
};

export type SubscriptionAccess = {
  planId: PlanId | null;
  isTrial: boolean;
  isActive: boolean;
  // Тариф оплачен, но мастер поставил его на паузу до этой даты.
  pausedUntil: string | null;
  activeUntil: string | null;
  capabilities: readonly PlanCapability[];
  includedSeats: number;
};

const ALL_CAPABILITIES: readonly PlanCapability[] = [
  "prepayment",
  "clientReliability",
  "aiConsultation",
  "team",
];

const NO_ACCESS: SubscriptionAccess = {
  planId: null,
  isTrial: false,
  isActive: false,
  pausedUntil: null,
  activeUntil: null,
  capabilities: [],
  includedSeats: 0,
};

// Мастера, купившие подписку до перехода на тарифную сетку, платили за доступ
// к AI-консультации и снятие лимита — это «Соло. Расширенный». Понижать их до
// базового нельзя: доступ уже оплачен.
const LEGACY_PRO_PLAN_ID: PlanId = "solo-plus";

function normalizePlanId(tier: string): PlanId | null {
  if (isPlanId(tier)) {
    return tier;
  }

  return tier === "pro" ? LEGACY_PRO_PLAN_ID : null;
}

function isFutureIso(iso: string | null): boolean {
  if (!iso) {
    return false;
  }

  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time > Date.now();
}

export function trialEndsAt(joinedAt: string | null | undefined): string | null {
  if (!joinedAt) {
    return null;
  }

  const joined = new Date(joinedAt).getTime();

  if (!Number.isFinite(joined)) {
    return null;
  }

  return new Date(joined + trialDays * 24 * 60 * 60 * 1000).toISOString();
}

export function resolveSubscription(
  input: SubscriptionInput,
): SubscriptionAccess {
  const planId = normalizePlanId(String(input.subscriptionTier ?? ""));

  if (planId) {
    // subscription_until = null трактуем как бессрочный доступ
    // (например, выданный вручную из админки).
    const isActive = !input.subscriptionUntil || isFutureIso(input.subscriptionUntil);

    if (isActive) {
      const plan = getPlan(planId);
      const pausedUntil = isFutureIso(input.subscriptionPausedUntil ?? null)
        ? (input.subscriptionPausedUntil ?? null)
        : null;

      if (pausedUntil) {
        // Тариф и срок остаются видны кабинету: по ним строится «вернуться
        // раньше» и подпись «оплачено до». Возможностей на паузе нет.
        return {
          planId,
          isTrial: false,
          isActive: false,
          pausedUntil,
          activeUntil: input.subscriptionUntil,
          capabilities: [],
          includedSeats: plan.includedSeats,
        };
      }

      return {
        planId,
        isTrial: false,
        isActive: true,
        pausedUntil: null,
        activeUntil: input.subscriptionUntil,
        capabilities: plan.capabilities,
        includedSeats: plan.includedSeats,
      };
    }
  }

  const trialUntil = trialEndsAt(input.joinedAt);

  if (isFutureIso(trialUntil)) {
    return {
      planId: null,
      isTrial: true,
      isActive: true,
      pausedUntil: null,
      activeUntil: trialUntil,
      capabilities: ALL_CAPABILITIES,
      includedSeats: 0,
    };
  }

  return NO_ACCESS;
}

// Есть ли у мастера рабочий доступ к сервису: оплаченный тариф или пробный период.
export function hasActiveSubscription(input: SubscriptionInput): boolean {
  return resolveSubscription(input).isActive;
}

export function hasCapability(
  input: SubscriptionInput,
  capability: PlanCapability,
): boolean {
  return resolveSubscription(input).capabilities.includes(capability);
}

export function formatSubscriptionUntil(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
