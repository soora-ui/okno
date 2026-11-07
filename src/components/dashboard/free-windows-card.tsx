"use client";

import { useCallback, useState, useTransition, type ReactNode } from "react";
import { DateTime } from "luxon";
import { Check, CircleCheck, Copy, Smartphone, Tag } from "lucide-react";
import { setHotWindowsDiscountAction } from "@/app/actions/free-windows";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FreeWindowsStoryDialog } from "@/components/dashboard/free-windows-story-dialog";
import { useDemoMode } from "@/components/tour/demo-mode";
import {
  buildFreeWindowsShareText,
  buildFreeWindowsTimelineAxis,
  formatFreeWindowRanges,
  freeWindowTimelineSegment,
  type FreeWindowDay,
} from "@/lib/free-windows";
import type { StoryPalette } from "@/lib/free-windows-story-options";
import type { HotWindowsDiscount } from "@/lib/service-discounts";

// Горящие окошки (документы/горящие-окошки.md): свободное время на ближайшие
// три дня таймлайном по часам и две кнопки, чтобы поделиться им в сторис и
// мессенджерах. Вёрстка — по макету «C · Таймлайн (кабинет)»; кнопка сторис
// открывает окно выбора стиля и цвета картинки.
export function FreeWindowsCard({
  days,
  bookingUrl,
  storyHref,
  storyDefaultPalette,
  hasBrandStyle = false,
  hotWindowsDiscount = null,
  timezone,
  memberId = null,
  masterName = null,
  picker = null,
}: {
  days: FreeWindowDay[];
  bookingUrl: string;
  storyHref: string;
  // Цвет сторис по умолчанию — в тон странице записи мастера.
  storyDefaultPalette: StoryPalette;
  // Фирменный стиль применён — в окне сторис появляется «Мой стиль».
  hasBrandStyle?: boolean;
  // Действующая скидка на окошки; включают её в окне сторис.
  hotWindowsDiscount?: HotWindowsDiscount | null;
  timezone: string;
  // Кабинет админа студии: окошки выбранного мастера. memberId уходит в
  // сторис и скидку, имя — в текст для чатов, picker — выбор мастера в шапке.
  memberId?: string | null;
  masterName?: string | null;
  picker?: ReactNode;
}) {
  const demo = useDemoMode();
  const [copied, setCopied] = useState(false);
  const [storyDialogOpen, setStoryDialogOpen] = useState(false);
  const closeStoryDialog = useCallback(() => setStoryDialogOpen(false), []);
  const [disabling, startDisabling] = useTransition();
  const [disableError, setDisableError] = useState(false);

  function disableDiscount() {
    setDisableError(false);
    startDisabling(async () => {
      const result = await setHotWindowsDiscountAction(0, memberId);
      if (!result.success) setDisableError(true);
    });
  }

  async function handleCopy() {
    try {
      // В демо (база знаний в кабинете) буфер мастера не трогаем — только
      // показываем, что текст скопировался бы.
      if (!demo) {
        await navigator.clipboard.writeText(
          buildFreeWindowsShareText(days, bookingUrl, hotWindowsDiscount?.percent, masterName),
        );
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена недоступен (без HTTPS или запрещён браузером) — текст
      // всё равно виден в карточке, его можно выделить вручную.
    }
  }

  const busyNotice = (
    <div className="flex items-center gap-3 rounded-panel border border-line bg-panel px-5 py-4">
      <CircleCheck size={20} strokeWidth={1.8} className="shrink-0 text-muted" aria-hidden />
      <span className="text-[15px] font-medium text-ink-soft">
        {masterName ? `У мастера ${masterName} ближайшие три дня заняты` : "Ближайшие три дня заняты"}
      </span>
    </div>
  );

  const header = (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
        Горящие окошки
      </p>
      <h2 className="text-[22px] font-semibold leading-[1.3] tracking-[-0.025em] text-ink">
        {masterName ? `Где у мастера ${masterName} пусто` : "Где в расписании пусто"}
      </h2>
    </div>
  );

  if (days.length === 0) {
    // С выбором мастера карточка остаётся: админ переключится на другого.
    return picker ? (
      <Card className="space-y-5">
        {header}
        {picker}
        {busyNotice}
      </Card>
    ) : (
      busyNotice
    );
  }

  const axis = buildFreeWindowsTimelineAxis(days);
  const tickPositions = ["0%", "25%", "50%", "75%", "100%"];
  // В тёмной теме цвет панели совпадает с фоном карточки — дорожка
  // пропадала, поэтому там она цвета линий.
  const trackClassName = "bg-[var(--color-panel)] dark:bg-[var(--color-line)]";

  return (
    <Card className="space-y-5">
      {header}
      {picker}

      <div className="space-y-4">
        {/* Шкала часов: крайние метки прижаты к краям, средние — по центру. */}
        <div className="relative h-3.5" aria-hidden>
          {axis.ticks.map((tick, index) => (
            <span
              key={tick}
              className="absolute top-0 text-[11px] font-medium leading-none text-muted"
              style={
                index === 0
                  ? { left: 0 }
                  : index === axis.ticks.length - 1
                    ? { right: 0 }
                    : { left: tickPositions[index], transform: "translateX(-50%)" }
              }
            >
              {tick}
            </span>
          ))}
        </div>

        <ul className="space-y-4">
          {days.map((day) => (
            <li key={day.date} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-[15px] font-semibold text-ink">
                  {day.dayName}{" "}
                  <span className="text-[13px] font-normal text-muted">· {day.dateLabel}</span>
                </span>
                <span className="text-[13px] font-semibold text-accent-deep">
                  {formatFreeWindowRanges(day.windows, " · ")}
                </span>
              </div>
              {/* Полоска дублирует время текстом выше, поэтому скрыта от скринридеров. */}
              <div className={`relative h-3 rounded-full ${trackClassName}`} aria-hidden>
                {day.windows.map((window) => {
                  const segment = freeWindowTimelineSegment(window, axis);
                  return (
                    <span
                      key={window.start}
                      className="absolute inset-y-0 rounded-full bg-[var(--color-accent-deep)]"
                      style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }}
                    />
                  );
                })}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 text-xs text-muted" aria-hidden>
          <span className="h-2 w-[18px] rounded-full bg-[var(--color-accent-deep)]" />
          свободно
          <span className={`ml-2.5 h-2 w-[18px] rounded-full ${trackClassName}`} />
          занято
        </div>
      </div>

      {hotWindowsDiscount ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-[var(--color-accent-deep)] bg-accent-soft px-4 py-3">
          <span className="flex items-center gap-2.5 text-sm text-ink">
            <Tag size={16} className="shrink-0 text-accent-deep" aria-hidden />
            <span>
              <span className="font-semibold">−{hotWindowsDiscount.percent}% на окошки</span>{" "}
              до{" "}
              {DateTime.fromISO(hotWindowsDiscount.untilIso)
                .setZone(timezone)
                .setLocale("ru")
                .toFormat("d MMMM")}{" "}
              включительно
            </span>
          </span>
          {demo ? null : (
            <button
              type="button"
              onClick={disableDiscount}
              disabled={disabling}
              className="text-sm font-medium text-ink-soft underline-offset-4 transition hover:text-ink hover:underline disabled:opacity-50"
            >
              {disabling ? "Выключаю…" : disableError ? "Не вышло, ещё раз" : "Выключить"}
            </button>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => setStoryDialogOpen(true)}
          aria-haspopup="dialog"
          className="gap-2.5 text-[15px]"
        >
          <Smartphone size={18} strokeWidth={1.8} />
          Картинка для сторис
        </Button>
        <Button variant="secondary" onClick={handleCopy} className="gap-2.5 text-[15px]">
          {copied ? (
            <Check size={18} strokeWidth={1.8} className="text-success" />
          ) : (
            <Copy size={18} strokeWidth={1.8} />
          )}
          {copied ? "Скопировано" : "Скопировать текст"}
        </Button>
      </div>
      {storyDialogOpen ? (
        <FreeWindowsStoryDialog
          storyHref={storyHref}
          defaultPalette={storyDefaultPalette}
          hasBrandStyle={hasBrandStyle}
          memberId={memberId}
          onClose={closeStoryDialog}
        />
      ) : null}
    </Card>
  );
}
