"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { PlanPeriodTabs } from "@/components/pricing/plan-period-tabs";
import {
  type BillingPeriodId,
  calculatePeriodFullPriceRub,
  calculatePeriodPriceRub,
  defaultBillingPeriodId,
  formatPlanPrice,
  getBillingPeriod,
  periodDiscountPercent,
  pricingPlans,
} from "@/config/plans";

// Карточки тарифов с переключателем периода. Клиентский островок: состояние
// переключателя нужно и панели, и каждой карточке.
//
// Таблица сравнения ниже остаётся в месячных ценах и за переключателем не
// ходит — она отвечает на вопрос «что входит», а не «сколько стоит», и
// четыре набора цен в ней только мешали бы.

export function PricingPlanCards() {
  const [periodId, setPeriodId] = useState<BillingPeriodId>(defaultBillingPeriodId);
  const period = getBillingPeriod(periodId);
  const isPrepaid = period.months > 1;

  return (
    <div className="space-y-6">
      <Reveal variant="fade-up" delay={0.2}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <PlanPeriodTabs value={periodId} onChange={setPeriodId} />
          <p className="text-sm text-muted">
            {isPrepaid
              ? `Оплата вперёд за ${period.days} дней, одним платежом.`
              : "Оплата за расчётный период в 30 дней."}
          </p>
        </div>
      </Reveal>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {pricingPlans.map((plan, index) => {
          const price = calculatePeriodPriceRub(plan.id, periodId);
          const fullPrice = calculatePeriodFullPriceRub(plan.id, periodId);
          const discount = periodDiscountPercent(plan.id, periodId);
          const perMonth = Math.round(price / period.months);

          return (
            <Reveal key={plan.id} variant="fade-up" delay={index * 0.1}>
              <Card className={`flex h-full flex-col ${plan.highlighted ? "bg-panel" : ""}`}>
                {/* Заголовком идёт название тарифа, а не цена: по заголовкам
                    навигируются с экранным диктором, и «690 ₽» без имени
                    плана там бесполезно. Визуально название тоже больше не
                    тише списка возможностей — выбирают именно между ними. */}
                <h2 className="text-xl font-semibold text-ink">{plan.title}</h2>

                <div className="mt-2">
                  {isPrepaid ? (
                    <p className="text-lg text-muted tabular-nums">
                      <s>{formatPlanPrice(fullPrice)}</s>
                      <span className="sr-only"> — цена без скидки за тот же срок</span>
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-4xl font-semibold tabular-nums text-ink">
                      {formatPlanPrice(price)}
                    </p>
                    <span className="text-sm text-muted">
                      {isPrepaid ? period.priceLabel : plan.period}
                    </span>
                    {discount > 0 ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-sm font-medium"
                        style={{
                          backgroundColor: "var(--color-accent-soft)",
                          color: "var(--color-accent-deep)",
                        }}
                      >
                        −{discount}%
                      </span>
                    ) : null}
                  </div>
                  {isPrepaid ? (
                    <p className="mt-1 text-sm text-muted tabular-nums">
                      {formatPlanPrice(perMonth)} в месяц
                    </p>
                  ) : null}
                </div>

                <p className="mt-3 text-base leading-7 text-ink-soft">{plan.description}</p>
                <div className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex gap-3">
                      <CheckCircle2 size={18} className="mt-1 shrink-0 text-success" />
                      <p className="text-base leading-7 text-ink-soft">{feature}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-6">
                  <ButtonLink
                    href="/register"
                    variant={plan.highlighted ? "primary" : "secondary"}
                  >
                    Попробовать месяц
                  </ButtonLink>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
