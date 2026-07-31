import Link from "next/link";
import { resolveErrorAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getRecentErrorEvents } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

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

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const onlyUnresolved = filter !== "all";
  const errors = await getRecentErrorEvents({ limit: 150, onlyUnresolved });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-ink">Технические ошибки</h1>
          <p className="text-sm text-ink-soft">
            Ошибки со всех пользователей — чините в первую очередь.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/errors"
            style={{
              backgroundColor: onlyUnresolved
                ? "var(--color-ink)"
                : "var(--ui-card-bg)",
              color: onlyUnresolved ? "#ffffff" : "var(--color-ink)",
              borderColor: "var(--color-line)",
            }}
            className="rounded-full border px-4 py-2 font-medium"
          >
            Нерешённые
          </Link>
          <Link
            href="/admin/errors?filter=all"
            style={{
              backgroundColor: onlyUnresolved
                ? "var(--ui-card-bg)"
                : "var(--color-ink)",
              color: onlyUnresolved ? "var(--color-ink)" : "#ffffff",
              borderColor: "var(--color-line)",
            }}
            className="rounded-full border px-4 py-2 font-medium"
          >
            Все
          </Link>
        </div>
      </div>

      {errors.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            {onlyUnresolved ? "Нерешённых ошибок нет 🎉" : "Ошибок пока нет."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {errors.map((error) => (
            <Card key={error.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={error.level === "error" ? "warning" : "neutral"}>
                      {error.level}
                    </Badge>
                    <Badge tone="neutral">{error.source}</Badge>
                    {error.resolved ? <Badge tone="success">решено</Badge> : null}
                    <span className="text-xs text-muted">
                      {error.route ?? "—"} · {formatDateTime(error.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink">{error.message}</p>
                </div>
                {!error.resolved ? (
                  <form action={resolveErrorAction}>
                    <input type="hidden" name="id" value={error.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:-translate-y-0.5"
                      style={{ backgroundColor: "var(--ui-card-bg)" }}
                    >
                      Решено
                    </button>
                  </form>
                ) : null}
              </div>
              {error.context ? (
                <pre className="overflow-x-auto rounded-field bg-panel p-3 text-xs text-ink-soft">
                  {JSON.stringify(error.context, null, 2)}
                </pre>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
