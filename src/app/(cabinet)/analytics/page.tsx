import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Clock, Lock, ReceiptText, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  analyticsPeriods,
  buildAnalyticsReport,
  mergeAnalyticsReports,
  parseAnalyticsPeriod,
  type AnalyticsReport,
  type MetricWithChange,
} from "@/lib/analytics";
import { getAnalyticsData } from "@/lib/data";
import { hasCapability } from "@/lib/subscription";
import { cn, pluralizeRu } from "@/lib/utils";

// Утилит bg-accent-deep / text-danger в проекте нет — цвет берём из токена.
const deep = "var(--color-accent-deep)";

// «Свободнее всего по вторникам».
const weekdayFreeLabels = [
  "по понедельникам",
  "по вторникам",
  "по средам",
  "по четвергам",
  "по пятницам",
  "по субботам",
  "по воскресеньям",
];

const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; master?: string }>;
}) {
  const [data, query] = await Promise.all([getAnalyticsData(), searchParams]);

  if (!data) {
    redirect("/login");
  }

  const period = parseAnalyticsPeriod(query.period);
  const timezone = data.profile.timezone;
  const reportFor = (input: Pick<typeof data, "bookings" | "services" | "clients" | "availabilityRules" | "blockedSlots">) =>
    buildAnalyticsReport({ ...input, timezone, period });

  // У администратора студии — «Вся студия» или отдельный мастер (?master=id).
  const team = "team" in data ? data.team : undefined;
  const selectedMember = team?.find((member) => member.id === query.master) ?? null;
  const report = team
    ? selectedMember
      ? reportFor(selectedMember)
      : mergeAnalyticsReports(team.map((member) => ({ name: member.name, report: reportFor(member) })))
    : reportFor(data);
  const showAdvanced = hasCapability(data.profile, "analytics");
  const linkTo = (next: { period?: string; master?: string | null }) => {
    const params = new URLSearchParams({ period: next.period ?? period });
    const master = next.master === undefined ? selectedMember?.id : next.master;
    if (master) params.set("master", master);
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-3">
        <Badge tone="accent">Аналитика</Badge>
        <h1 className="text-4xl font-semibold text-ink">Деньги и загрузка</h1>
        <p className="max-w-2xl text-sm leading-7 text-ink-soft">
          Считается само по записям и графику работы. Ничего вносить не нужно.
        </p>
      </div>

      {team ? (
        <nav aria-label="Мастер" className="flex flex-wrap gap-2">
          {[{ id: null, name: "Вся студия" }, ...team].map((member) => {
            const active = (member.id ?? null) === (selectedMember?.id ?? null);
            return (
              <Link
                key={member.id ?? "team"}
                href={linkTo({ master: member.id })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition",
                  active
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-line text-ink-soft hover:border-ink-soft",
                )}
              >
                {member.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Период" className="flex flex-wrap gap-2">
          {analyticsPeriods.map((item) => {
            const active = item.id === report.period.id;
            return (
              <Link
                key={item.id}
                href={linkTo({ period: item.id })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition",
                  active
                    ? "border-ink bg-ink text-ink-contrast"
                    : "border-line text-ink-soft hover:border-ink-soft",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="text-sm text-muted">{report.period.rangeLabel}</p>
      </div>

      {report.hasData ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<Wallet className="text-success" size={22} />}
              label="Выручка"
              value={rub(report.revenue.value)}
              metric={report.revenue}
              compareLabel={report.period.compareLabel}
              note={
                report.revenue.expected > 0
                  ? `И ещё ${rub(report.revenue.expected)} в записях до конца периода`
                  : null
              }
            />
            <MetricCard
              icon={<CalendarCheck className="text-accent-deep" size={22} />}
              label="Визиты"
              value={String(report.visits.value)}
              metric={report.visits}
              compareLabel={report.period.compareLabel}
            />
            <MetricCard
              icon={<ReceiptText className="text-warning" size={22} />}
              label="Средний чек"
              value={rub(report.averageCheck.value)}
              metric={report.averageCheck}
              compareLabel={report.period.compareLabel}
            />
            <Card className="space-y-2">
              <Clock className="text-accent-deep" size={22} />
              <p className="text-sm text-muted">Загрузка графика</p>
              <p className="text-3xl font-semibold text-ink">
                {report.load.pastPct === null ? "—" : `${report.load.pastPct}%`}
              </p>
              <p className="text-sm leading-6 text-ink-soft">
                {report.load.pastPct === null
                  ? "Задай рабочие часы в расписании, чтобы считать загрузку."
                  : report.load.aheadPct !== null
                    ? `Оставшиеся дни уже заняты на ${report.load.aheadPct}%`
                    : "Доля рабочего времени, занятая визитами"}
              </p>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
            <RevenueChart report={report} />
            <WeekdayLoad report={report} />
          </div>

          {showAdvanced ? (
            <AdvancedSection report={report} />
          ) : (
            <Card className="flex flex-wrap items-center justify-between gap-4 bg-panel">
              <div className="flex gap-3">
                <Lock size={20} className="mt-0.5 shrink-0 text-muted" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ink">
                    Какая услуга приносит больше всего за час работы
                  </p>
                  <p className="max-w-xl text-sm leading-6 text-ink-soft">
                    Доход в час по каждой услуге, новые и постоянные клиенты, деньги, потерянные
                    на неявках. Есть в тарифе «Соло. Расширенный» и выше.
                  </p>
                </div>
              </div>
              <ButtonLink href="/settings?tab=account" variant="secondary">
                Открыть тарифы
              </ButtonLink>
            </Card>
          )}

          <p className="text-xs leading-5 text-muted">
            Суммы считаются по цене на момент записи. Неявки и отмены в выручку не входят, а
            визиты без отметки считаются состоявшимися.
          </p>
        </>
      ) : (
        <EmptyState
          title="Пока нечего считать"
          description="Аналитика появится после первых визитов: выручка, загрузка графика и самые выгодные услуги."
          ctaLabel="Открыть расписание"
          ctaHref="/schedule"
        />
      )}
    </div>
  );
}

function ChangeLine({ metric, compareLabel }: { metric: MetricWithChange; compareLabel: string }) {
  if (metric.changePct === null) {
    return <p className="text-sm text-muted">Сравнивать пока не с чем</p>;
  }

  const sign = metric.changePct > 0 ? "+" : "";
  const color =
    metric.changePct > 0
      ? "var(--color-success)"
      : metric.changePct < 0
        ? "var(--color-danger)"
        : undefined;

  return (
    <p className="text-sm text-muted">
      <span className="font-semibold" style={{ color }}>
        {sign}
        {metric.changePct}%
      </span>{" "}
      {compareLabel}
    </p>
  );
}

function MetricCard({
  icon,
  label,
  value,
  metric,
  compareLabel,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  metric: MetricWithChange;
  compareLabel: string;
  note?: string | null;
}) {
  return (
    <Card className="space-y-2">
      {icon}
      <p className="text-sm text-muted">{label}</p>
      <p className="text-3xl font-semibold text-ink">{value}</p>
      <ChangeLine metric={metric} compareLabel={compareLabel} />
      {note ? <p className="text-sm leading-6 text-ink-soft">{note}</p> : null}
    </Card>
  );
}

function RevenueChart({ report }: { report: AnalyticsReport }) {
  const max = Math.max(1, ...report.chart.map((bucket) => bucket.revenue));
  const labelEvery = report.chart.length > 16 ? 5 : 1;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-semibold text-ink">
          Выручка {report.period.id === "90d" ? "по неделям" : "по дням"}
        </h2>
        <div className="flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: deep }} /> заработано
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border bg-accent-soft" style={{ borderColor: deep }} />{" "}
            записано
          </span>
        </div>
      </div>
      <div className="flex h-48 items-end gap-[3px]">
        {report.chart.map((bucket) => (
          <div
            key={bucket.key}
            className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${bucket.label}: ${rub(bucket.revenue)}`}
          >
            <div
              className={cn(
                "w-full rounded-t-[3px]",
                bucket.isFuture && "border border-b-0 bg-accent-soft",
              )}
              style={{
                height: bucket.revenue > 0 ? `${Math.max(3, (bucket.revenue / max) * 100)}%` : "0",
                ...(bucket.isFuture ? { borderColor: deep } : { backgroundColor: deep }),
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] border-t border-line pt-2">
        {report.chart.map((bucket, index) => (
          <span key={bucket.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted">
            {index % labelEvery === 0 ? bucket.label : ""}
          </span>
        ))}
      </div>
    </Card>
  );
}

function WeekdayLoad({ report }: { report: AnalyticsReport }) {
  const working = report.load.byWeekday.filter((day) => day.pct !== null);
  const emptiest = working.length > 1
    ? working.reduce((min, day) => ((day.pct ?? 0) < (min.pct ?? 0) ? day : min))
    : null;

  return (
    <Card className="space-y-4">
      <h2 className="text-2xl font-semibold text-ink">Загрузка по дням недели</h2>
      <div className="space-y-2.5">
        {report.load.byWeekday.map((day) => (
          <div key={day.weekday} className="flex items-center gap-3">
            <span className="w-6 text-sm text-ink-soft">{day.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel">
              {day.pct !== null ? (
                <div
                  className="h-full rounded-full"
                  style={{ width: `${day.pct}%`, backgroundColor: deep }}
                />
              ) : null}
            </div>
            <span className="w-14 text-right text-sm tabular-nums text-muted">
              {day.pct === null ? "выходной" : `${day.pct}%`}
            </span>
          </div>
        ))}
      </div>
      {emptiest && emptiest.pct !== null && emptiest.pct < 50 ? (
        <p className="rounded-panel bg-panel px-4 py-3 text-sm leading-6 text-ink-soft">
          Свободнее всего {weekdayFreeLabels[emptiest.weekday - 1]}. Можно предложить постоянным клиентам
          это время или поставить на него акцию.
        </p>
      ) : null}
    </Card>
  );
}

function AdvancedSection({ report }: { report: AnalyticsReport }) {
  const { clients, losses } = report;
  const lossTotal = losses.noShowAmount + losses.lateCancelAmount;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
      <Card className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-ink">Доход в час по услугам</h2>
          <p className="text-sm text-muted">
            Сколько приносит час в графике, вместе с перерывом после визита.
          </p>
        </div>
        {report.services.length > 0 ? (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-2 pb-2 font-normal">Услуга</th>
                  <th className="px-2 pb-2 text-right font-normal">Визиты</th>
                  <th className="px-2 pb-2 text-right font-normal">Выручка</th>
                  <th className="px-2 pb-2 text-right font-normal">В час</th>
                </tr>
              </thead>
              <tbody>
                {report.services.map((service, index) => (
                  <tr key={service.serviceId} className="border-t border-line">
                    <td className="px-2 py-2.5 text-ink">
                      {service.title}
                      {index === 0 && report.services.length > 1 ? (
                        <span className="ml-2 align-middle">
                          <Badge tone="success">выгоднее всего</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">
                      {service.visits}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">
                      {rub(service.revenue)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-ink">
                      {service.revenuePerHour === null ? "—" : rub(service.revenuePerHour)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">В этом периоде визитов ещё не было.</p>
        )}
      </Card>

      <div className="space-y-6">
        <Card className="space-y-3">
          <h2 className="text-2xl font-semibold text-ink">Клиенты</h2>
          <p className="text-3xl font-semibold text-ink">
            {clients.returningPct === null ? "—" : `${clients.returningPct}%`}
            <span className="ml-2 text-sm font-normal text-muted">постоянных</span>
          </p>
          <p className="text-sm leading-6 text-ink-soft">
            {pluralizeRu(clients.total, "клиент", "клиента", "клиентов")} за период:{" "}
            {clients.newCount} новых и {clients.returningCount} вернувшихся.
          </p>
          {clients.dueForReturn > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-panel px-4 py-3">
              <p className="text-sm text-ink-soft">
                {pluralizeRu(clients.dueForReturn, "клиент давно не был", "клиента давно не были", "клиентов давно не были")}
              </p>
              <ButtonLink href="/clients" variant="secondary">
                Напомнить
              </ButtonLink>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-2xl font-semibold text-ink">Потери</h2>
          <p className="text-3xl font-semibold text-ink">{rub(lossTotal)}</p>
          <p className="text-sm leading-6 text-ink-soft">
            {lossTotal > 0
              ? `${pluralizeRu(losses.noShowCount, "неявка", "неявки", "неявок")} и ${pluralizeRu(losses.lateCancelCount, "поздняя отмена", "поздние отмены", "поздних отмен")}. Предоплата за услугу закрывает эту дыру.`
              : "Ни одной неявки и поздней отмены за период."}
          </p>
          {lossTotal > 0 ? (
            <ButtonLink href="/settings" variant="secondary">
              Настроить предоплату
            </ButtonLink>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
