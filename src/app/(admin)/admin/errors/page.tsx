import Link from "next/link";
import { resolveErrorGroupAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getGroupedErrorEvents } from "@/lib/admin/queries";

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

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const onlyUnresolved = filter !== "all";
  const { groups, scanned, scanLimit } = await getGroupedErrorEvents({
    onlyUnresolved,
  });

  const totalEvents = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-ink">Технические ошибки</h1>
          <p className="text-sm text-ink-soft">
            Одинаковые ошибки собраны в группы — чините сверху вниз, там самое
            свежее.
          </p>
          {groups.length > 0 ? (
            <p className="text-xs text-muted">
              {groups.length}{" "}
              {plural(groups.length, "проблема", "проблемы", "проблем")} ·{" "}
              {totalEvents}{" "}
              {plural(totalEvents, "событие", "события", "событий")}
              {scanned >= scanLimit
                ? ` · показаны последние ${scanLimit}, более старые не вошли`
                : ""}
            </p>
          ) : null}
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

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            {onlyUnresolved ? "Нерешённых ошибок нет 🎉" : "Ошибок пока нет."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card key={group.key} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={group.level === "error" ? "warning" : "neutral"}>
                      {group.level}
                    </Badge>
                    <Badge tone="neutral">{group.source}</Badge>
                    {group.count > 1 ? (
                      <Badge tone="neutral">×{group.count}</Badge>
                    ) : null}
                    {group.unresolvedCount === 0 ? (
                      <Badge tone="success">решено</Badge>
                    ) : null}
                    <span className="text-xs text-muted">
                      {group.route ?? "—"} · {formatDateTime(group.lastSeen)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink">{group.message}</p>
                  {group.count > 1 ? (
                    <p className="text-xs text-muted">
                      с {formatDateTime(group.firstSeen)} по{" "}
                      {formatDateTime(group.lastSeen)}
                      {group.digest ? ` · digest ${group.digest}` : ""}
                    </p>
                  ) : null}
                </div>
                {group.unresolvedCount > 0 ? (
                  <form action={resolveErrorGroupAction}>
                    <input
                      type="hidden"
                      name="ids"
                      value={group.unresolvedIds.join(",")}
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:-translate-y-0.5"
                      style={{ backgroundColor: "var(--ui-card-bg)" }}
                    >
                      {group.unresolvedCount > 1
                        ? `Решено (${group.unresolvedCount})`
                        : "Решено"}
                    </button>
                  </form>
                ) : null}
              </div>
              {group.latestContext ? (
                <pre className="overflow-x-auto rounded-field bg-panel p-3 text-xs text-ink-soft">
                  {JSON.stringify(group.latestContext, null, 2)}
                </pre>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
