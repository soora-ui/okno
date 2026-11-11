"use client";

import { useState } from "react";
import { BookingCard } from "@/app/tg/booking-card";
import { hapticSelect } from "@/app/tg/telegram";
import type { MiniAppData, TabId } from "@/app/tg/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Segment = "upcoming" | "past";

export function VisitsTab({
  data,
  initData,
  onReload,
  onNavigate,
}: {
  data: MiniAppData;
  initData: string;
  onReload: () => void;
  onNavigate: (tab: TabId) => void;
}) {
  // Нет предстоящих, но есть история — открываем сразу её: пустой список
  // первым экраном выглядит как «у тебя ничего нет».
  const [segment, setSegment] = useState<Segment>(
    data.bookings.length === 0 && data.past.length > 0 ? "past" : "upcoming",
  );
  const list = segment === "upcoming" ? data.bookings : data.past;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">Визиты</h1>

      <div
        role="tablist"
        aria-label="Какие визиты показать"
        className="grid grid-cols-2 gap-1 rounded-full border border-line bg-panel p-1"
      >
        {(
          [
            { id: "upcoming", label: "Предстоящие", count: data.bookings.length },
            { id: "past", label: "Прошедшие", count: data.past.length },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={segment === item.id}
            onClick={() => {
              hapticSelect();
              setSegment(item.id);
            }}
            className={cn(
              "min-h-10 rounded-full px-3 text-sm font-medium transition-colors duration-200",
              segment === item.id ? "bg-surface text-ink shadow-subtle" : "text-muted",
            )}
          >
            {item.label}
            {item.count > 0 ? <span className="ml-1.5 text-muted">{item.count}</span> : null}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <p className="font-semibold text-ink">
            {segment === "upcoming" ? "Ближайших записей нет" : "Истории пока нет"}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {segment === "upcoming"
              ? "Запишись к своему мастеру или найди нового в поиске."
              : data.hasIdentity
                ? "Здесь появятся прошедшие визиты: отзыв, чаевые и повторная запись."
                : "Историю показываем по номеру телефона — подтверди его в профиле."}
          </p>
          <Button
            className="mt-4"
            onClick={() =>
              onNavigate(segment === "past" && !data.hasIdentity ? "profile" : "search")
            }
          >
            {segment === "past" && !data.hasIdentity ? "Открыть профиль" : "Найти мастера"}
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((booking) => (
            <BookingCard
              key={booking.bookingId}
              booking={booking}
              past={segment === "past"}
              initData={initData}
              review={data.reviews.find((item) => item.bookingId === booking.bookingId)}
              onReload={onReload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
