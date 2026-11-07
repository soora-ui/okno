"use client";

import { useState } from "react";
import { FreeWindowsCard } from "@/components/dashboard/free-windows-card";
import { Button } from "@/components/ui/button";
import type { FreeWindowDay } from "@/lib/free-windows";
import type { StoryPalette } from "@/lib/free-windows-story-options";
import type { HotWindowsDiscount } from "@/lib/service-discounts";
import { pluralizeRu } from "@/lib/utils";

export type TeamFreeWindowsMember = {
  id: string;
  fullName: string;
  days: FreeWindowDay[];
  bookingUrl: string;
  timezone: string;
  storyDefaultPalette: StoryPalette;
  hasBrandStyle: boolean;
  hotWindowsDiscount: HotWindowsDiscount | null;
};

// Горящие окошки в кабинете админа студии: сначала мастер, потом его окошки.
// Всё остальное — та же карточка, что у мастера в личном кабинете; сторис,
// текст и скидка относятся к выбранному мастеру и ведут на его страницу.
export function TeamFreeWindowsCard({
  members,
  storyHref,
}: {
  members: TeamFreeWindowsMember[];
  storyHref: string;
}) {
  // По имени: порядок из выдачи студии не постоянный, и кнопки прыгали бы
  // между заходами.
  const sorted = [...members].sort((left, right) => left.fullName.localeCompare(right.fullName, "ru"));
  // Сразу показываем того, у кого есть окошки: пустая карточка первым
  // экраном выглядит так, будто функция не работает.
  const [selectedId, setSelectedId] = useState(
    () => (sorted.find((member) => member.days.length > 0) ?? sorted[0])?.id ?? "",
  );
  const selected = sorted.find((member) => member.id === selectedId) ?? sorted[0];

  if (!selected) return null;

  const picker = (
    <div className="space-y-2.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Мастер</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Чьи окошки показать">
        {sorted.map((member) => {
          const windowsCount = member.days.reduce((sum, day) => sum + day.windows.length, 0);
          return (
            <Button
              key={member.id}
              variant={member.id === selected.id ? "primary" : "secondary"}
              aria-pressed={member.id === selected.id}
              onClick={() => setSelectedId(member.id)}
              className="h-auto min-h-11 flex-col items-start gap-0 px-4! py-2! text-left"
            >
              <span className="text-[15px] font-medium leading-5">{member.fullName}</span>
              <span className="text-xs leading-4 opacity-70">
                {windowsCount > 0
                  ? pluralizeRu(windowsCount, "окошко", "окошка", "окошек")
                  : "всё занято"}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );

  return (
    <FreeWindowsCard
      // key — чтобы при смене мастера сбросились «Скопировано» и открытое окно.
      key={selected.id}
      days={selected.days}
      bookingUrl={selected.bookingUrl}
      storyHref={storyHref}
      storyDefaultPalette={selected.storyDefaultPalette}
      hasBrandStyle={selected.hasBrandStyle}
      hotWindowsDiscount={selected.hotWindowsDiscount}
      timezone={selected.timezone}
      memberId={selected.id}
      masterName={selected.fullName}
      picker={picker}
    />
  );
}
