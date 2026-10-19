import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCurrentAuthProfile } from "@/lib/data";
import { feedbackKindLabels, feedbackStatusLabels } from "@/lib/feedback/config";
import { listOwnFeedback, markOwnRepliesSeen } from "@/lib/feedback/service";

// Идеи и проблемы от мастера и ответы команды на них.
//
// История здесь не для красоты: мастер, который видит «Сделано» под своей
// идеей, пишет снова. Без этого ящик для предложений через месяц пустеет.
// Сюда же приходят ответы тем, у кого не подключён Telegram.

const statusTones = {
  new: "neutral",
  planned: "accent",
  done: "success",
  declined: "warning",
} as const;

export default async function FeedbackPage() {
  const authProfile = await getCurrentAuthProfile();

  if (!authProfile) {
    redirect("/login");
  }

  const { profile } = authProfile;
  const items = await listOwnFeedback(profile.id);

  if (items.some((item) => item.adminReply && !item.replySeen)) {
    await markOwnRepliesSeen(profile.id);
  }

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-3">
        <Badge tone="accent">Обратная связь</Badge>
        <h1 className="text-4xl font-semibold text-ink">Идеи и проблемы</h1>
        <p className="max-w-2xl text-sm leading-7 text-ink-soft">
          Напиши, чего не хватает или что мешает работать. Каждое сообщение читает команда
          okno — когда сделаем, ответим в Telegram или здесь.
        </p>
      </div>

      <Card>
        <FeedbackForm />
      </Card>

      {items.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Ты писал</h2>
          {items.map((item) => (
            <Card key={item.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTones[item.status]}>{feedbackStatusLabels[item.status]}</Badge>
                <span className="text-xs text-muted">
                  {feedbackKindLabels[item.kind]} ·{" "}
                  {DateTime.fromISO(item.createdAt)
                    .setZone(profile.timezone)
                    .setLocale("ru")
                    .toFormat("d MMMM yyyy")}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{item.message}</p>
              {item.adminReply ? (
                <div className="rounded-panel bg-panel px-4 py-3">
                  <p className="text-xs text-muted">Ответ команды okno</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">
                    {item.adminReply}
                  </p>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
