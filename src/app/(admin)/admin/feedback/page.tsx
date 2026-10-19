import Link from "next/link";
import { FeedbackReplyForm } from "@/components/admin/feedback-reply-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  type FeedbackFilter,
  getFeedbackSummary,
  getMasterFeedback,
} from "@/lib/admin/queries";
import {
  type FeedbackKind,
  feedbackKindLabels,
  feedbackStatusLabels,
  reasonLabel,
} from "@/lib/feedback/config";

export const dynamic = "force-dynamic";

// Всё, что мастера говорят о сервисе: идеи, проблемы, причины отключения
// автопродления, ответы на опросы. Сверху сводка — по ней видно, куда
// двигаться; ниже сами сообщения — по ним видно, что именно делать.

const filters: { value: FeedbackFilter; label: string }[] = [
  { value: "open", label: "Требуют ответа" },
  { value: "ideas", label: "Идеи и проблемы" },
  { value: "cancel", label: "Отмены" },
  { value: "trial", label: "Пробный период" },
  { value: "pulse", label: "Опрос Эллиса" },
  { value: "all", label: "Всё" },
];

const statusTones = {
  new: "warning",
  planned: "accent",
  done: "success",
  declined: "neutral",
} as const;

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function ReasonBars({
  kind,
  rows,
  total,
}: {
  kind: FeedbackKind;
  rows: { reason: string; count: number }[];
  total: number;
}) {
  if (total === 0) {
    return <p className="text-sm text-muted">Пока нет ответов.</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.reason} className="space-y-1">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-ink">{reasonLabel(kind, row.reason) ?? "Без причины"}</span>
            <span className="tabular-nums text-muted">
              {row.count} · {percent(row.count, total)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel">
            <div
              className="h-full rounded-full"
              style={{
                width: `${percent(row.count, total)}%`,
                backgroundColor: "var(--color-accent-deep)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function isFilter(value: string | undefined): value is FeedbackFilter {
  return filters.some((item) => item.value === value);
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const filter: FeedbackFilter = isFilter(rawFilter) ? rawFilter : "open";
  const [summary, entries] = await Promise.all([
    getFeedbackSummary(),
    getMasterFeedback({ filter }),
  ]);
  const ellis = percent(summary.pulseVery, summary.pulseTotal);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink">Обратная связь мастеров</h1>
        <p className="text-sm text-ink-soft">
          Сводка за последние полгода. Ответ мастеру уходит в Telegram, а если бот не
          подключён — ждёт его на странице «Идеи и проблемы».
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-5">
          <p className="text-sm text-muted">Тест Эллиса · «очень расстроюсь»</p>
          <p className="text-4xl font-semibold tabular-nums text-ink">
            {summary.pulseTotal > 0 ? `${ellis}%` : "—"}
          </p>
          <p className="text-xs leading-5 text-ink-soft">
            {summary.pulseTotal > 0
              ? `${summary.pulseTotal} ответов: очень — ${summary.pulseVery}, немного — ${summary.pulseSomewhat}, без разницы — ${summary.pulseNot}. Цель — 40% и выше.`
              : "Ответов пока нет. Первые придут через 14 дней после первой оплаты мастеров."}
          </p>
        </Card>
        <Card className="space-y-3 p-5">
          <p className="text-sm text-muted">
            Отключение автопродления · {summary.cancelTotal}
            {summary.savedByPause > 0 ? ` · ушли в паузу: ${summary.savedByPause}` : ""}
          </p>
          <ReasonBars kind="cancel" rows={summary.cancelReasons} total={summary.cancelTotal} />
        </Card>
        <Card className="space-y-3 p-5">
          <p className="text-sm text-muted">Пробный период · {summary.trialTotal}</p>
          <ReasonBars kind="trial_ended" rows={summary.trialReasons} total={summary.trialTotal} />
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {filters.map((item) => {
          const active = item.value === filter;
          return (
            <Link
              key={item.value}
              href={item.value === "open" ? "/admin/feedback" : `/admin/feedback?filter=${item.value}`}
              style={{
                backgroundColor: active ? "var(--color-ink)" : "var(--ui-card-bg)",
                color: active ? "#ffffff" : "var(--color-ink)",
                borderColor: "var(--color-line)",
              }}
              className="rounded-full border px-4 py-2 font-medium"
            >
              {item.label}
              {item.value === "open" && summary.openIdeas > 0 ? ` · ${summary.openIdeas}` : ""}
            </Link>
          );
        })}
      </div>

      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Здесь пока пусто.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const reason = reasonLabel(entry.kind, entry.reason);
            const contextLine = [
              entry.context.subscription,
              entry.context.device,
              entry.context.path,
              entry.context.outcome === "paused"
                ? `ушёл в паузу на ${String(entry.context.pauseDays ?? "?")} дн.`
                : null,
              entry.channel === "telegram" ? "из Telegram" : null,
            ]
              .filter(Boolean)
              .map(String)
              .join(" · ");
            const isConversation = entry.kind === "idea" || entry.kind === "bug";

            return (
              <Card key={entry.id} className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{feedbackKindLabels[entry.kind]}</Badge>
                  {isConversation ? (
                    <Badge tone={statusTones[entry.status]}>
                      {feedbackStatusLabels[entry.status]}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted">{formatDateTime(entry.createdAt)}</span>
                  <span className="text-xs text-muted">
                    {entry.masterName ?? "—"}
                    {entry.masterUsername ? ` · @${entry.masterUsername}` : ""}
                    {entry.masterEmail ? ` · ${entry.masterEmail}` : ""}
                  </span>
                </div>

                {reason ? (
                  <p className="text-sm font-semibold text-ink">{reason}</p>
                ) : null}
                {entry.message ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{entry.message}</p>
                ) : null}
                {contextLine ? <p className="text-xs text-muted">{contextLine}</p> : null}

                {entry.replySentAt ? (
                  <p className="text-xs text-success">
                    Ответ отправлен {formatDateTime(entry.replySentAt)}
                    {entry.replyChannel === "telegram" ? " в Telegram" : " в кабинет"}
                  </p>
                ) : null}

                <details open={isConversation && entry.status === "new"}>
                  <summary className="cursor-pointer text-xs text-muted">
                    Статус и ответ мастеру
                  </summary>
                  <div className="mt-2">
                    <FeedbackReplyForm
                      id={entry.id}
                      status={entry.status}
                      adminReply={entry.adminReply}
                      replySent={Boolean(entry.replySentAt)}
                    />
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
