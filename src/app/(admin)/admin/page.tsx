import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GrantProForm } from "@/components/admin/grant-pro-form";
import {
  getMoneyMetrics,
  getPlatformMetrics,
  getRecentErrorEvents,
  getRecentPayments,
} from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

const paymentStatusTone: Record<string, "success" | "warning" | "neutral"> = {
  succeeded: "success",
  pending: "warning",
  canceled: "neutral",
};

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="space-y-1">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="text-3xl font-semibold text-ink">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const [platform, money, payments, unresolvedErrors] = await Promise.all([
    getPlatformMetrics(),
    getMoneyMetrics(),
    getRecentPayments(12),
    getRecentErrorEvents({ limit: 5, onlyUnresolved: true }),
  ]);

  return (
    <div className="space-y-10">
      {/* Технические проблемы — в первую очередь */}
      {unresolvedErrors.length > 0 ? (
        <Card
          className="space-y-4"
          style={{ borderColor: "var(--color-warning)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge tone="warning">Требует внимания</Badge>
              <h2 className="text-lg font-semibold text-ink">
                Нерешённые технические ошибки
              </h2>
            </div>
            <Link
              href="/admin/errors"
              className="text-sm font-medium text-ink underline-offset-4 hover:underline"
            >
              Все ошибки →
            </Link>
          </div>
          <ul className="space-y-2">
            {unresolvedErrors.map((error) => (
              <li
                key={error.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 text-sm last:border-0 last:pb-0"
              >
                <span className="font-medium text-ink">{error.message}</span>
                <span className="text-xs text-muted">
                  {error.source} · {error.route ?? "—"} · {formatDateTime(error.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Метрики платформы</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Всего мастеров" value={String(platform.totalMasters)} />
          <MetricCard
            label="Активный PRO"
            value={String(platform.activePro)}
            hint="включая бессрочные"
          />
          <MetricCard
            label="Новые за 7 / 30 дней"
            value={`${platform.newMasters7d} / ${platform.newMasters30d}`}
          />
          <MetricCard label="Всего записей" value={String(platform.totalBookings)} />
          <MetricCard label="Всего клиентов" value={String(platform.totalClients)} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Деньги и подписки</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Доход (успешные оплаты)"
            value={`${money.revenueRub.toLocaleString("ru-RU")} ₽`}
          />
          <MetricCard label="Успешных оплат" value={String(money.succeededCount)} />
          <MetricCard label="В ожидании" value={String(money.pendingCount)} />
        </div>

        <Card className="space-y-4">
          <h3 className="text-base font-semibold text-ink">Последние оплаты</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-muted">Оплат пока нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Мастер</th>
                    <th className="pb-2 pr-4 font-medium">Сумма</th>
                    <th className="pb-2 pr-4 font-medium">Статус</th>
                    <th className="pb-2 font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-line">
                      <td className="py-2 pr-4 text-ink">
                        {payment.masterEmail ?? payment.masterName ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-ink">
                        {payment.amount.toLocaleString("ru-RU")} {payment.currency}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={paymentStatusTone[payment.status] ?? "neutral"}>
                          {payment.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted">
                        {formatDateTime(payment.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Выдать PRO по почте</h2>
        <Card className="max-w-md">
          <GrantProForm />
        </Card>
      </section>
    </div>
  );
}
