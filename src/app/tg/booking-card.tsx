"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { ConsultantChat } from "@/app/tg/consultant-chat";
import { MasterAvatar } from "@/app/tg/master-avatar";
import { ReviewForm } from "@/app/tg/review-form";
import { openExternal } from "@/app/tg/telegram";
import { TipForm } from "@/app/tg/tip-form";
import type { MiniAppBooking, MiniAppReview } from "@/app/tg/types";
import { Button, ButtonLink } from "@/components/ui/button";

type Panel = "consultant" | "tip" | "review" | null;

// Карточка визита во вкладке «Визиты»: слева дата, справа услуга и мастер,
// ниже — всё, что с этим визитом можно сделать.
export function BookingCard({
  booking,
  past,
  initData,
  review,
  onReload,
}: {
  booking: MiniAppBooking;
  past: boolean;
  initData: string;
  review?: MiniAppReview;
  onReload: () => void;
}) {
  // Одна раскрытая панель за раз. Две одновременно на телефоне не помещаются,
  // а две кнопки «Свернуть» рядом друг с другом неразличимы.
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (next: NonNullable<Panel>) =>
    setPanel((current) => (current === next ? null : next));
  // Консультант живёт при прошедшем визите: вопросы про уход возникают после
  // процедуры, а не до неё.
  const canAsk = past && booking.consultantAvailable && booking.consultantToken;
  const [day, month] = booking.dayLabel.split(" ");
  const place = [booking.city, booking.address].filter(Boolean).join(", ");

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-panel bg-panel py-2">
          <span className="text-xl font-semibold leading-none text-ink">{day}</span>
          <span className="mt-1 text-[11px] leading-none text-muted">
            {month?.slice(0, 3)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-ink">{booking.serviceTitle}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {booking.timeLabel} · {booking.weekdayLabel}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2.5 border-t border-line pt-3">
        <MasterAvatar name={booking.masterName} url={booking.masterAvatarUrl} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{booking.masterName}</p>
          {place ? (
            <p className="flex items-center gap-1 truncate text-xs text-muted">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Перенос и отмена живут на той же странице, что и в ссылке из
            записи: слот-пикер там уже есть, а внутри мини-аппа она
            открывается своим же вебвью. */}
        {!past && booking.cancelUrl ? (
          <ButtonLink href={booking.cancelUrl} variant="secondary" className="px-4 py-2">
            Перенести или отменить
          </ButtonLink>
        ) : null}
        {!past && booking.routeUrl ? (
          <Button
            variant="secondary"
            className="px-4 py-2"
            onClick={() => openExternal(booking.routeUrl as string)}
          >
            Маршрут
          </Button>
        ) : null}
        {/* Подпись не меняется на «Свернуть»: открытое состояние показывает
            заливка, а одинаковые подписи у соседних кнопок читать невозможно. */}
        {past ? (
          <Button
            variant={panel === "review" ? "primary" : "secondary"}
            className="px-4 py-2"
            onClick={() => toggle("review")}
          >
            {review ? `Отзыв: ${review.rating}★` : "Оставить отзыв"}
          </Button>
        ) : null}
        {past ? (
          <Button
            variant={panel === "tip" ? "primary" : "secondary"}
            className="px-4 py-2"
            onClick={() => toggle("tip")}
          >
            Чаевые
          </Button>
        ) : null}
        {canAsk ? (
          <Button
            variant={panel === "consultant" ? "primary" : "secondary"}
            className="px-4 py-2"
            onClick={() => toggle("consultant")}
          >
            Спросить про уход
          </Button>
        ) : null}
        <ButtonLink
          href={booking.repeatUrl}
          variant={past ? "primary" : "secondary"}
          className="px-4 py-2"
          documentNavigation
        >
          {past ? "Записаться снова" : "Записаться ещё"}
        </ButtonLink>
      </div>

      {canAsk && panel === "consultant" ? (
        <ConsultantChat token={booking.consultantToken as string} />
      ) : null}
      {past && panel === "review" ? (
        <ReviewForm
          initData={initData}
          bookingId={booking.bookingId}
          existingRating={review?.rating ?? null}
          existingComment={review?.comment ?? ""}
          onSaved={() => {
            setPanel(null);
            onReload();
          }}
        />
      ) : null}
      {past && panel === "tip" ? (
        <TipForm initData={initData} bookingId={booking.bookingId} onOpenLink={openExternal} />
      ) : null}
    </li>
  );
}
