"use client";

import {
  type BillingPeriodId,
  billingPeriods,
  periodDiscountPercent,
  pricingPlans,
} from "@/config/plans";

// Панель выбора периода оплаты. Живёт отдельно от карточек, потому что её же
// показывает кабинет над формой оплаты, — переключатель на витрине и в
// настройках должен выглядеть и называться одинаково.
//
// Радиокнопки настоящие, просто спрятанные: так работает переход стрелками и
// экранный диктор объявляет группу, а не четыре разрозненные кнопки.

// Скидка на панели одна на все тарифы. Округление считается от сумм, поэтому
// теоретически у разных тарифов процент мог бы разойтись — берём наименьший,
// чтобы подпись не обещала больше, чем получит хоть кто-то.
const tabDiscount = (periodId: BillingPeriodId) =>
  Math.min(...pricingPlans.map((plan) => periodDiscountPercent(plan.id, periodId)));

export function PlanPeriodTabs({
  value,
  onChange,
  name = "billingPeriod",
  size = "large",
}: {
  value: BillingPeriodId;
  onChange: (periodId: BillingPeriodId) => void;
  name?: string;
  size?: "large" | "compact";
}) {
  const compact = size === "compact";

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Период оплаты</legend>
      {/* Переносим на вторую строку, а не прокручиваем вбок: при прокрутке
          самый выгодный вариант оказывается за краем экрана — то есть его
          просто не увидят. */}
      <div
        className={`flex w-full flex-wrap gap-1 rounded-panel border border-line bg-panel p-1 ${
          compact ? "" : "sm:w-auto"
        }`}
      >
        {billingPeriods.map((period) => {
          const selected = period.id === value;
          const discount = tabDiscount(period.id);

          return (
            <label
              key={period.id}
              className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-nested transition ${
                compact ? "px-3 py-2" : "px-4 py-2.5"
              } ${
                selected
                  ? "bg-background shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={period.id}
                checked={selected}
                onChange={() => onChange(period.id)}
                className="sr-only"
              />
              <span
                className={`whitespace-nowrap ${compact ? "text-xs" : "text-sm"} ${
                  selected ? "font-medium text-ink" : ""
                }`}
              >
                {period.tabLabel}
              </span>
              {discount > 0 ? (
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                    selected ? "" : "opacity-70"
                  }`}
                  style={{
                    backgroundColor: "var(--color-accent-soft)",
                    color: "var(--color-accent-deep)",
                  }}
                >
                  −{discount}%
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
