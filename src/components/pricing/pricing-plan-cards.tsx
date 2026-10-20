"use client";

import { useState, type CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { PlanPeriodTabs } from "@/components/pricing/plan-period-tabs";
import {
  type BillingPeriodId,
  type PlanId,
  calculatePeriodFullPriceRub,
  calculatePeriodPriceRub,
  defaultBillingPeriodId,
  getBillingPeriod,
  periodDiscountPercent,
  pricingPlans,
} from "@/config/plans";
import styles from "./pricing-plan-scene.module.css";

// Витрина тарифов «сценой» (макет «Выбор тарифа.html»): переключатель плана,
// слева иллюстрация того, что тариф делает, справа цена и состав.
// Клиентский островок: состояние периода и плана нужно и сцене, и описанию.
//
// Таблица сравнения ниже остаётся в месячных ценах и за переключателем не
// ходит — она отвечает на вопрос «что входит», а не «сколько стоит».

// Открываем сразу рекомендованный тариф: его чаще всего и выбирают, а
// базовый виден рядом в переключателе с ценой.
const defaultPlanId: PlanId =
  pricingPlans.find((plan) => plan.highlighted)?.id ?? pricingPlans[0].id;

// «1 290 ₽» с неразрывным пробелом, как в макете. Обычный formatPlanPrice
// пишет «1290 ₽» — для таблицы это нормально, для крупной цены — нет.
const rub = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

const delay = (seconds: number): CSSProperties => ({
  animationDelay: `${seconds}s`,
});

export function PricingPlanCards() {
  const [periodId, setPeriodId] = useState<BillingPeriodId>(defaultBillingPeriodId);
  const [planId, setPlanId] = useState<PlanId>(defaultPlanId);
  const period = getBillingPeriod(periodId);
  const isPrepaid = period.months > 1;

  const planIndex = pricingPlans.findIndex((plan) => plan.id === planId);
  const plan = pricingPlans[planIndex];
  const price = calculatePeriodPriceRub(plan.id, periodId);
  const fullPrice = calculatePeriodFullPriceRub(plan.id, periodId);
  const discount = periodDiscountPercent(plan.id, periodId);

  return (
    <div className={`${styles.root} space-y-6`}>
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

      <Reveal variant="fade-up" delay={0.25}>
        {/* Радиокнопки настоящие, просто спрятанные: стрелки переключают план,
            диктор объявляет группу. */}
        <fieldset className="min-w-0">
          <legend className="sr-only">Тариф</legend>
          <div
            className={styles.tabs}
            style={{ "--plan-index": planIndex } as CSSProperties}
          >
            <div className={styles.indicator} aria-hidden="true" />
            {pricingPlans.map((item) => {
              const active = item.id === planId;
              const perMonth = Math.round(
                calculatePeriodPriceRub(item.id, periodId) / period.months,
              );

              return (
                <label
                  key={item.id}
                  className={`${styles.tab} ${active ? styles.tabActive : ""}`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={item.id}
                    checked={active}
                    onChange={() => setPlanId(item.id)}
                    className="sr-only"
                  />
                  <b>{item.title}</b>
                  <span>
                    {rub(perMonth)}
                    <span className="hidden sm:inline"> в месяц</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className={styles.body}>
          {/* Сцена — иллюстрация, её содержание дублирует список справа. */}
          <div key={`stage-${plan.id}`} className={styles.stage} aria-hidden="true">
            <PlanStage planId={plan.id} />
          </div>

          <div key={`desc-${plan.id}`} className={styles.desc}>
            <span className={styles.tag}>{plan.tag}</span>
            <h2 className={styles.title}>{plan.title}</h2>

            <div className={styles.priceBlock}>
              {isPrepaid ? (
                <p className="text-lg text-muted tabular-nums">
                  <s>{rub(fullPrice)}</s>
                  <span className="sr-only"> — цена без скидки за тот же срок</span>
                </p>
              ) : null}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className={styles.price}>{rub(price)}</p>
                <span className={styles.priceUnit}>
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
              {/* Сравнение посчитано от месячной цены. При оплате вперёд под
                  ценой уже есть зачёркнутая сумма и помесячная — третья
                  строка там только мешала бы. */}
              {isPrepaid ? (
                <p className="mt-1 text-sm text-muted tabular-nums">
                  {rub(Math.round(price / period.months))} в месяц
                </p>
              ) : (
                <p className={styles.valueNote}>{plan.valueNote}</p>
              )}
            </div>

            <p className={styles.lead}>{plan.description}</p>

            <ul className={styles.features}>
              {plan.features.map((feature, index) => (
                <li key={feature} style={delay(0.34 + index * 0.08)}>
                  {feature}
                </li>
              ))}
            </ul>

            <div
              className={styles.cta}
              style={delay(0.34 + plan.features.length * 0.08)}
            >
              <ButtonLink href="/register" variant="primary">
                Попробовать месяц
              </ButtonLink>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function PlanStage({ planId }: { planId: PlanId }) {
  if (planId === "solo-basic") {
    return (
      <>
        <div className={styles.cap}>Четверг</div>
        <Slot time="10:00" name="Свободно" at={0.1} />
        <Slot time="12:00" name="Свободно" at={0.2} />
        <div className={`${styles.slot} ${styles.booked}`} style={{ animationDelay: "0.3s, 1.1s" }}>
          <span className={styles.time}>14:00</span>
          <span className={styles.name}>Анна · стрижка</span>
          <span className={styles.check} />
        </div>
        <Slot time="16:00" name="Свободно" at={0.4} />
        <div className={styles.toast}>Новая запись · уведомление в Telegram</div>
      </>
    );
  }

  if (planId === "solo-plus") {
    return (
      <div className={styles.cols}>
        <div>
          <div className={styles.cap}>Четверг</div>
          <Slot time="10:00" name="Свободно" at={0.1} />
          <div className={`${styles.slot} ${styles.booked}`} style={{ animationDelay: "0.2s, 1.3s" }}>
            <span className={styles.time}>14:00</span>
            <span className={styles.name}>Анна</span>
            <span className={styles.coin}>₽</span>
          </div>
          <div className={styles.chip}>Предоплата получена</div>
        </div>
        <div>
          <div className={styles.cap}>Клиент</div>
          <div className={styles.card} style={delay(0.3)}>
            <h3>Надёжность</h3>
            <div className={styles.track}>
              <div className={styles.fill} />
            </div>
            <div className={styles.fillLabel}>Приходит на визиты</div>
          </div>
          <div className={styles.card} style={delay(0.4)}>
            <h3>AI-консультант</h3>
            <div className={`${styles.bubble} ${styles.question}`}>
              Сколько длится услуга?
            </div>
            <div className={styles.ai}>
              <div className={styles.dots}>
                <i />
                <i />
                <i />
              </div>
              <div className={`${styles.bubble} ${styles.answer}`}>
                1,5 часа. Ответ из вашего мануала.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const load = [
    { height: 78, at: 0.1, grow: 0.7 },
    { height: 96, at: 0.2, grow: 0.8 },
    { height: 52, at: 0.3, grow: 0.9 },
  ];

  return (
    <>
      <div className={styles.cap}>Загрузка команды · вид администратора</div>
      <div className={styles.team}>
        {load.map((member, index) => (
          <div key={index} className={styles.member} style={delay(member.at)}>
            <div className={styles.avatar}>{index + 1}</div>
            <div className={styles.memberName}>Мастер {index + 1}</div>
            <div className={styles.bars}>
              <div
                className={styles.bar}
                style={{ height: `${member.height}%`, ...delay(member.grow) }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Slot({ time, name, at }: { time: string; name: string; at: number }) {
  return (
    <div className={styles.slot} style={delay(at)}>
      <span className={styles.time}>{time}</span>
      <span className={styles.name}>{name}</span>
    </div>
  );
}
