import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getRecentAuditLogs } from "@/lib/admin/queries";

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

export default async function AdminLogsPage() {
  const logs = await getRecentAuditLogs(100);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink">Логи активности</h1>
        <p className="text-sm text-ink-soft">
          Последние системные события платформы (аудит).
        </p>
      </div>

      <Card>
        {logs.length === 0 ? (
          <p className="text-sm text-muted">Событий пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Событие</th>
                  <th className="pb-2 pr-4 font-medium">Кто</th>
                  <th className="pb-2 pr-4 font-medium">Статус</th>
                  <th className="pb-2 pr-4 font-medium">Объект</th>
                  <th className="pb-2 font-medium">Когда</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-line align-top">
                    <td className="py-2 pr-4 font-medium text-ink">
                      {log.eventType}
                      {log.message ? (
                        <span className="block text-xs font-normal text-muted">
                          {log.message}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{log.actorKind}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={log.status === "failure" ? "warning" : "success"}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted">{log.targetType ?? "—"}</td>
                    <td className="py-2 text-muted">{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
