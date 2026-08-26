import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Minus } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { SectionTitle } from "@/components/sections/section-title";
import { PricingPlanCards } from "@/components/pricing/pricing-plan-cards";
import {
  billingPeriods,
  calculatePlanPriceRub,
  extraSeat,
  extraSeatPriceRub,
  formatPlanPrice,
  getPlan,
  planComparisonGroups,
  planPeriodDays,
  pricingPlans,
  seatTopUpThresholdDays,
  trialDays,
  trialOffer,
  type PlanComparisonValue,
} from "@/config/plans";

export const metadata: Metadata = {
  title: "Тарифы — okno",
  description:
    "Пробный месяц, три тарифа от 690 ₽ и доплата за сотрудников. Сравнение возможностей, порядок оплаты и ответы на вопросы о подписке.",
};

// Пример расчёта для студии: три сотрудника включены, четвёртый и пятый —
// доплата. Считаем той же функцией, что и биллинг, чтобы пример не устарел
// после смены цены.
const seatExampleSeats = 5;
const studioPlan = getPlan("studio");
const seatExampleTotal = calculatePlanPriceRub("studio", seatExampleSeats);
const seatExamplePaid = seatExampleSeats - studioPlan.includedSeats;

const prepaidPeriods = billingPeriods.filter((period) => period.discountPercent > 0);
const prepaidSummary = prepaidPeriods
  .map((period) => `${period.months} месяцев — минус ${period.discountPercent} %`)
  .join(", ");

const paymentFaq = [
  {
    question: "Что будет, когда закончится пробный месяц?",
    answer:
      "Страница записи перестанет принимать новые записи. Уже созданные записи, база клиентов и выпущенные сертификаты останутся на месте — всё вернётся в работу после оплаты любого тарифа.",
  },
  {
    question: "Что даёт оплата вперёд?",
    answer: `Скидку на весь оплаченный срок: ${prepaidSummary}. Платёж один, доступ продлевается сразу на весь период. «Месяц» здесь везде означает расчётный период в ${planPeriodDays} дней, поэтому год — это 360 дней.`,
  },
  {
    question: "Деньги списываются автоматически?",
    answer:
      "Только если вы сами поставили галочку «продлевать автоматически» при оплате. Тогда карта сохраняется, и следующий период списывается тем же сроком и по той же цене со скидкой — за несколько дней до списания приходит напоминание в Telegram. Без галочки платёжные данные не сохраняются и каждый период оплачивается вручную. Отключить автопродление и отвязать карту можно в настройках в любой момент.",
  },
  {
    question: "Можно ли перейти на другой тариф?",
    answer:
      "Да, при оплате следующего периода — выбираете нужный тариф и период и платите по его цене. Внутри уже оплаченного периода перерасчёт не делается.",
  },
  {
    question: "Как считается доплата за сотрудников?",
    answer: `Три сотрудника входят в тариф «Студия и барбершоп». За каждого следующего — ${extraSeatPriceRub} ₽ в месяц. Количество считается на момент оплаты, и доплата за нового сотрудника входит в следующий платёж. Если до него больше ${seatTopUpThresholdDays} дней — так бывает при оплате на полгода или год, — место оплачивается сразу за оставшиеся дни периода и с той же скидкой.`,
  },
  {
    question: "Кто получает деньги клиентов за услуги?",
    answer:
      "Вы напрямую. Предоплата и сертификаты проходят через вашу ЮKassa, чаевые — через CloudTips. Сервис эти деньги не принимает и не хранит, подписка — единственный платёж в его адрес.",
  },
  {
    question: "Можно ли вернуть деньги?",
    answer:
      "Первые 14 дней после первой оплаты — полный возврат без объяснения причин, один раз за всю историю аккаунта. Дальше при отказе от подписки возвращаются деньги за неиспользованные полные месяцы: из оплаченной суммы вычитается стоимость использованных месяцев по обычной месячной цене тарифа. То есть скидка за оплату вперёд при досрочном отказе не сохраняется. Отдельно — технические случаи: двойное списание, длительная недоступность сервиса по нашей вине, оплата не того тарифа из-за бага. Тут возврат полный, без сроков и лимитов.",
  },
];

function ComparisonCell({ value }: { value: PlanComparisonValue }) {
  if (value === true) {
    return (
      <>
        <CheckCircle2
          size={18}
          className="mx-auto text-success"
          aria-hidden
        />
        <span className="sr-only">Входит в тариф</span>
      </>
    );
  }

  if (value === false) {
    return (
      <>
        <Minus size={18} className="mx-auto text-muted" aria-hidden />
        <span className="sr-only">Не входит в тариф</span>
      </>
    );
  }

  return <span className="text-sm text-ink">{value}</span>;
}

export default function PricingPage() {
  return (
    <SiteShell resolveAuth={false} showFooter>
      <div className="space-y-16 py-6">
        <div className="space-y-8">
          <Reveal variant="blur">
            <div className="space-y-4">
              <Badge tone="accent">Тарифы</Badge>
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-ink">
                Месяц на пробу, дальше — тариф под размер команды.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-ink-soft">
                Тариф выбирается один раз и меняется, когда меняется работа: мастер
                работает один, потом подключает предоплату, потом набирает команду.
              </p>
            </div>
          </Reveal>

          <Reveal variant="fade-up" delay={0.15}>
            <Card
              className="border-transparent text-white"
              style={{
                background: "var(--gradient-ink)",
              }}
            >
              <p className="text-sm uppercase tracking-[0.24em] text-white/70">
                {trialOffer.title}
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-white">
                {trialDays} дней с момента регистрации
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
                {trialOffer.description}
              </p>
            </Card>
          </Reveal>

          <PricingPlanCards />
        </div>

        <section className="space-y-6">
          <Reveal variant="fade-up">
            <SectionTitle
              eyebrow="Сравнение"
              title="Что докупается при переходе"
              description="Всё, что есть в базовом тарифе, остаётся и в старших. Разница — в трёх строках про деньги, клиентов и команду."
            />
          </Reveal>

          <Reveal variant="fade-up" delay={0.1}>
            {/* Таблица шире телефона и едет вбок. Подсказка нужна, потому что
                на узком экране обрезанная колонка не читается как «здесь можно
                прокрутить». */}
            <p className="mb-2 text-sm text-muted md:hidden">
              Таблицу можно прокрутить вбок — названия строк остаются на месте.
            </p>
            <div className="overflow-x-auto rounded-card border border-line">
              {/* На телефоне таблица ужимается до 30rem вместо 44rem: при
                  704px пришлось бы отматывать 329px вбок, при 480px — 105px. */}
              <table className="w-full min-w-[30rem] border-collapse text-left md:min-w-[44rem]">
                <caption className="sr-only">
                  Сравнение возможностей тарифов okno
                </caption>
                <thead>
                  <tr style={{ backgroundColor: "var(--color-panel)" }}>
                    {/* Первая колонка липкая: уехав вправо, пользователь видел
                        три галочки и не знал, к какой возможности они относятся. */}
                    <th
                      scope="col"
                      className="sticky left-0 z-10 w-40 bg-panel px-5 py-4 text-sm font-medium text-ink md:w-auto"
                    >
                      Возможность
                    </th>
                    {pricingPlans.map((plan) => (
                      <th
                        key={plan.id}
                        scope="col"
                        className="px-5 py-4 text-center text-sm font-medium text-ink"
                      >
                        <span className="block">{plan.title}</span>
                        <span className="mt-1 block text-xs font-normal text-muted">
                          {formatPlanPrice(plan.priceRub)} {plan.period}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                {planComparisonGroups.map((group) => (
                  <tbody key={group.title}>
                    <tr className="border-t border-line">
                      <th
                        scope="colgroup"
                        colSpan={pricingPlans.length + 1}
                        className="px-5 pb-2 pt-6 text-left text-xs uppercase tracking-[0.18em] text-muted"
                      >
                        {group.title}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label} className="border-t border-line">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-background px-5 py-4 text-left align-top font-normal"
                        >
                          <span className="block text-base leading-6 text-ink">
                            {row.label}
                          </span>
                          {row.hint ? (
                            <span className="mt-1 block text-sm leading-5 text-muted">
                              {row.hint}
                            </span>
                          ) : null}
                        </th>
                        {pricingPlans.map((plan) => (
                          <td
                            key={plan.id}
                            className="px-5 py-4 text-center align-top"
                          >
                            <ComparisonCell value={row.values[plan.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Reveal>
        </section>

        <section className="space-y-6">
          <Reveal variant="fade-up">
            <SectionTitle
              eyebrow="Команда"
              title={extraSeat.title}
              description={extraSeat.description}
            />
          </Reveal>

          <Reveal variant="fade-up" delay={0.1}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Card className="space-y-4 bg-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  Пример расчёта
                </p>
                <p className="text-base leading-7 text-ink-soft">
                  В студии {seatExampleSeats} активных мастеров.{" "}
                  {studioPlan.includedSeats} входят в тариф, за остальных{" "}
                  {seatExamplePaid} — доплата.
                </p>
                <dl className="space-y-2 text-base">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-soft">{studioPlan.title}</dt>
                    <dd className="tabular-nums text-ink">
                      {formatPlanPrice(studioPlan.priceRub)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-soft">
                      {seatExamplePaid} × {formatPlanPrice(extraSeatPriceRub)}
                    </dt>
                    <dd className="tabular-nums text-ink">
                      {formatPlanPrice(seatExamplePaid * extraSeatPriceRub)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-line pt-3">
                    <dt className="font-medium text-ink">Итого за месяц</dt>
                    <dd className="tabular-nums text-xl font-semibold text-ink">
                      {formatPlanPrice(seatExampleTotal)}
                    </dd>
                  </div>
                </dl>
              </Card>

              <Card className="space-y-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  Как это работает
                </p>
                <ul className="space-y-3 text-base leading-7 text-ink-soft">
                  <li className="flex gap-3">
                    <CheckCircle2 size={18} className="mt-1.5 shrink-0 text-success" />
                    <span>
                      Учитываются только активные сотрудники. Отключённый
                      сотрудник места не занимает.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 size={18} className="mt-1.5 shrink-0 text-success" />
                    <span>
                      Администратор рабочего пространства сотрудником не
                      считается и в доплату не входит.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 size={18} className="mt-1.5 shrink-0 text-success" />
                    <span>
                      Количество фиксируется в момент оплаты. Добавили мастера
                      в середине месяца — доплата войдёт в следующий платёж,
                      внутри оплаченного периода ничего не пересчитывается.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 size={18} className="mt-1.5 shrink-0 text-success" />
                    <span>
                      Если период оплачен вперёд и до следующего платежа больше{" "}
                      {seatTopUpThresholdDays} дней, место оплачивается сразу за
                      оставшиеся дни — по той же скидке, что у оплаченного периода.
                    </span>
                  </li>
                </ul>
              </Card>
            </div>
          </Reveal>
        </section>

        <section className="space-y-6">
          <Reveal variant="fade-up">
            <SectionTitle
              eyebrow="Оплата"
              title="Частые вопросы"
              description="Коротко о том, как устроены деньги в сервисе."
            />
          </Reveal>

          <Reveal variant="fade-up" delay={0.1}>
            <div className="space-y-3">
              {paymentFaq.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-nested border border-line px-6 py-5 transition"
                  style={{ backgroundColor: "var(--ui-card-bg)" }}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span
                      aria-hidden
                      className="shrink-0 text-xl text-muted transition group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-base leading-7 text-ink-soft">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="space-y-6">
          <Reveal variant="fade-up">
            <Card className="space-y-5 bg-panel">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  Условия оплаты
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-ink">
                  Что важно знать до оплаты
                </h2>
              </div>
              <ul className="space-y-3 text-base leading-7 text-ink-soft">
                <li>
                  Базовая цена указана за расчётный период в {planPeriodDays} дней.
                  Оплата вперёд считается в тех же периодах: 3 месяца — это{" "}
                  {planPeriodDays * 3} дней, год — {planPeriodDays * 12} дней.
                </li>
                <li>
                  Оплата проходит через ЮKassa одним платежом за весь выбранный
                  срок. Автосписание включается только вашей галочкой при оплате
                  и отключается в настройках.
                </li>
                <li>
                  Изменение тарифов не затрагивает уже оплаченный период — новая
                  цена применяется со следующего платежа.
                </li>
                <li>
                  Подписка — единственный платёж в адрес сервиса. Предоплата,
                  чаевые и сертификаты идут напрямую вам через подключённые вами
                  платёжные сервисы.
                </li>
                <li>
                  Оплачивая тариф, вы принимаете условия публичной оферты.
                  Порядок возврата, приостановки доступа и ответственность
                  сторон описаны там же.
                </li>
              </ul>
              <div className="flex flex-wrap items-center gap-4">
                <ButtonLink href="/legal/offer" variant="secondary">
                  Публичная оферта
                </ButtonLink>
                <Link
                  href="/legal/privacy"
                  className="text-sm text-ink-soft underline underline-offset-4 transition hover:text-ink"
                >
                  Политика обработки персональных данных
                </Link>
              </div>
            </Card>
          </Reveal>
        </section>
      </div>
    </SiteShell>
  );
}
