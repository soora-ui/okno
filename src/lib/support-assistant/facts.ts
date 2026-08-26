// Факты сервиса, вытащенные из настоящих источников правды.
//
// Правило простое: любое число, название тарифа или предел, который где-то уже
// объявлен константой, сюда импортируется, а не перепечатывается. База знаний
// поддержки один раз уже разъехалась с кодом — бот бодро рассказывал про
// «okno Pro за 690 ₽» и «50 бесплатных записей» через месяц после того, как
// тарифная сетка стала другой. Уверенное враньё в поддержке хуже молчания,
// поэтому цифры теперь физически не могут устареть: поменяется plans.ts —
// поменяется и ответ бота.
//
// Прозу (описания, пути по интерфейсу, нюансы) по-прежнему пишет человек в
// sitemap.ts — из кода её не вытащить, а канцелярит из автогенерации читать
// невозможно.
//
// Модуль серверный: его тянет только sitemap.ts, который дальше идёт в промпт.

import {
  autopayMaxAttempts,
  billingPeriods,
  extraSeatPriceRub,
  getPlan,
  longPeriodReminderLeadDays,
  planPeriodDays,
  pricingPlans,
  reminderLeadDays,
  trialDays,
  type PlanCapability,
} from "@/config/plans";
import { legalDocuments, supportEmail } from "@/config/legal";
import {
  giftCertificateMaxAmount,
  giftCertificateMinAmount,
  headlineMaxLength,
  maxGiftCertificateDenominations,
  subheadlineMaxLength,
} from "@/lib/booking-page-settings";
import { prepaymentReservationMinutes } from "@/lib/prepayment";
import { referralBonusDays } from "@/lib/referral";
import { manualMaxLength, manualMinLength } from "@/lib/service-manuals";
import {
  tipAmountOptionsRub,
  tipMaxAmountRub,
  tipMinAmountRub,
} from "@/lib/tips";
import { telegramLinkTokenTtlMinutes } from "@/lib/telegram/link";

function quote(value: string) {
  return `«${value}»`;
}

// «А», «Б» и «В» — перечисление для живого текста, а не через запятую до конца.
function joinRu(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  return `${values.slice(0, -1).join(", ")} и ${values.at(-1)}`;
}

/** Тарифы строками: «Соло. Базовый» — 690 ₽ за 30 дней. Одному мастеру… */
export const planLines: string[] = pricingPlans.map(
  (plan) =>
    `${quote(plan.title)} — ${plan.priceRub} ₽ за ${planPeriodDays} дней. ${plan.description}`,
);

/** Что открывает каждый тариф — из features, без пересказа. */
export const planFeatureLines: string[] = pricingPlans.map(
  (plan) => `${quote(plan.title)}: ${plan.features.join("; ")}.`,
);

/**
 * На каких тарифах доступна возможность. Нужен там, где мастер спрашивает не
 * «сколько стоит», а «а у меня это есть» — ответ обязан совпадать с серверным
 * гейтом hasCapability, поэтому берётся из тех же capabilities.
 */
export function plansWithCapability(capability: PlanCapability): string {
  const titles = pricingPlans
    .filter((plan) => plan.capabilities.includes(capability))
    .map((plan) => quote(plan.title));

  return joinRu(titles);
}

/** Периоды оплаты со скидками: «3 месяца — скидка 5 %». */
export const billingPeriodLines: string[] = billingPeriods
  .filter((period) => period.discountPercent > 0)
  .map((period) => `${period.tabLabel} — скидка ${period.discountPercent} %`);

const studioPlan = getPlan("studio");

export const facts = {
  trialDays,
  planPeriodDays,
  extraSeatPriceRub,
  includedSeats: studioPlan.includedSeats,
  studioPlanTitle: studioPlan.title,
  autopayMaxAttempts,
  reminderLeadDays,
  longPeriodReminderLeadDays,
  prepaymentReservationMinutes,
  giftCertificateMinAmount,
  giftCertificateMaxAmount,
  maxGiftCertificateDenominations,
  headlineMaxLength,
  subheadlineMaxLength,
  manualMinLength,
  manualMaxLength,
  tipMinAmountRub,
  tipMaxAmountRub,
  tipQuickAmounts: tipAmountOptionsRub.join(", "),
  referralBonusDays,
  telegramLinkTokenTtlMinutes,
  supportEmail,
} as const;

/** Юрдокументы — только названия и адреса страниц, без текста самих документов. */
export const legalDocumentLines: string[] = legalDocuments.map(
  (document) => `${document.navTitle} — okno.business${document.href}`,
);
