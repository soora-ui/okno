import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getSupportEscalations } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

// Список вопросов, на которых AI-поддержка споткнулась.
//
// Это не журнал обращений, а перечень пробелов в карте сервиса. Каждая строка
// означает, что бот не нашёл ответа и позвал человека; если такой вопрос
// приходит второй раз, тему пора дописать в src/lib/support-assistant/sitemap.ts.
// Без этого разбора поток к оператору не уменьшится: одни и те же вопросы
// будут звать живого человека снова и снова.

function formatDateTime(iso: string | null): string {
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

export default async function AdminSupportPage() {
  const escalations = await getSupportEscalations(100);
  const pending = escalations.filter((item) => item.status === "pending");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink">Пробелы в поддержке</h1>
        <p className="text-sm text-ink-soft">
          Вопросы, на которые бот не нашёл ответа в карте сервиса. Повторяющиеся
          темы стоит дописать в карту — тогда они перестанут доходить до
          оператора.
        </p>
      </div>

      {pending.length > 0 ? (
        <Card>
          <p className="text-sm text-ink">
            Без ответа: <span className="font-semibold">{pending.length}</span>.
            Мастера ждут в чате.
          </p>
        </Card>
      ) : null}

      {escalations.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Обращений пока нет — бот отвечает на всё сам.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {escalations.map((item) => (
            <Card key={item.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-panel px-3 py-1 font-mono text-xs text-ink">
                  {item.code}
                </span>
                <Badge tone={item.status === "answered" ? "success" : "warning"}>
                  {item.status === "answered" ? "Отвечено" : "Ждёт ответа"}
                </Badge>
                <span className="text-xs text-muted">
                  {formatDateTime(item.createdAt)}
                  {item.answeredAt ? ` → ${formatDateTime(item.answeredAt)}` : ""}
                </span>
                <span className="text-xs text-muted">
                  {item.masterName ?? "—"}
                  {item.masterEmail ? ` · ${item.masterEmail}` : ""}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <p className="whitespace-pre-wrap text-ink">{item.question}</p>

                <details className="text-ink-soft">
                  <summary className="cursor-pointer text-xs text-muted">
                    Черновик бота
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap">{item.draftAnswer}</p>
                </details>

                {item.operatorReply ? (
                  <div className="rounded-field bg-panel px-3 py-2">
                    <p className="text-xs text-muted">Ответ оператора</p>
                    <p className="mt-1 whitespace-pre-wrap text-ink">
                      {item.operatorReply}
                    </p>
                    {item.deliveredReply &&
                    item.deliveredReply !== item.operatorReply ? (
                      <>
                        <p className="mt-3 text-xs text-muted">
                          Что увидел мастер
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-ink-soft">
                          {item.deliveredReply}
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
