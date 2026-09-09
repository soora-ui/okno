import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowLeft, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getDashboardData } from "@/lib/data";
import { getReviewsForProfile, summarizeReviews } from "@/lib/reviews";
import { pluralizeRu } from "@/lib/utils";

// Лента отзывов мастера.
//
// Отзывы приватные: сюда они приходят из кабинета клиента и больше нигде не
// показываются. Мастер их не правит и не удаляет — отзыв, который можно
// стереть, перестаёт быть обратной связью.
//
// Отдельным разделом, а не вкладкой в нижней панели: там намеренно четыре
// пункта, и пятый превратил бы её в разложенный горизонтально бургер.

export default async function ReviewsPage() {
  const data = await getDashboardData();

  if (!data) {
    redirect("/login");
  }

  const { profile } = data;
  const reviews = await getReviewsForProfile({ profileId: profile.id });
  const summary = summarizeReviews(reviews);

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge tone="accent">Отзывы</Badge>
          <h1 className="text-4xl font-semibold text-ink">Что пишут клиенты</h1>
          <p className="max-w-2xl text-sm leading-7 text-ink-soft">
            Отзыв оставляют в своём кабинете после визита. Их видите только вы — на
            странице записи они не показываются.
          </p>
        </div>
        <ButtonLink href="/clients" variant="secondary" className="gap-2">
          <ArrowLeft size={16} />
          К клиентам
        </ButtonLink>
      </div>

      {summary.count > 0 ? (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5">
          <p className="inline-flex items-center gap-2 text-2xl font-semibold text-ink">
            <Star size={22} style={{ color: "var(--color-warning)" }} fill="currentColor" />
            {summary.average}
          </p>
          <p className="text-sm text-ink-soft">
            {summary.count} {pluralizeRu(summary.count, "отзыв", "отзыва", "отзывов")}
          </p>
        </Card>
      ) : null}

      {reviews.length === 0 ? (
        <EmptyState
          title="Отзывов пока нет"
          description="Клиент оставляет отзыв в своём кабинете в Telegram — после того, как визит прошёл. Чтобы кабинет у него появился, он подключает бота на странице подтверждения записи."
          ctaLabel="К клиентам"
          ctaHref="/clients"
        />
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <Card className="space-y-2 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{review.clientName}</p>
                  <p className="inline-flex items-center gap-1 text-sm text-ink">
                    <Star
                      size={14}
                      style={{ color: "var(--color-warning)" }}
                      fill="currentColor"
                    />
                    {review.rating}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  {review.serviceTitle}
                  {review.startsAtIso
                    ? ` · ${DateTime.fromISO(review.startsAtIso, { zone: "utc" })
                        .setZone(profile.timezone)
                        .setLocale("ru")
                        .toFormat("d LLLL yyyy")}`
                    : ""}
                </p>
                {review.comment ? (
                  <p className="text-sm leading-6 text-ink-soft">{review.comment}</p>
                ) : (
                  <p className="text-sm leading-6 text-muted">Без комментария.</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
