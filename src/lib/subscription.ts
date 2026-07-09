// Параметры PRO-подписки мастера. Импортируются и сервером, и клиентским UI.

export const proPlan = {
  id: "pro" as const,
  title: "okno Pro",
  priceRub: 690,
  periodDays: 30,
};

// PRO активен, если тариф = pro и срок (если задан) ещё не истёк.
// subscription_until = null трактуем как «бессрочный pro» (напр. выданный вручную).
export function hasActivePro(input: {
  subscriptionTier: string;
  subscriptionUntil: string | null;
}): boolean {
  if (input.subscriptionTier !== "pro") {
    return false;
  }

  if (!input.subscriptionUntil) {
    return true;
  }

  const until = new Date(input.subscriptionUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
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
