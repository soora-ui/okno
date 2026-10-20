"use client";

import { useState } from "react";
import { Check, CircleCheck, Copy, LoaderCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildFreeWindowsShareText,
  buildFreeWindowsTimelineAxis,
  formatFreeWindowRanges,
  freeWindowTimelineSegment,
  type FreeWindowDay,
} from "@/lib/free-windows";

// Горящие окошки (документы/горящие-окошки.md): свободное время на ближайшие
// три дня таймлайном по часам и две кнопки, чтобы поделиться им в сторис и
// мессенджерах. Вёрстка — по макету «C · Таймлайн (кабинет)».
export function FreeWindowsCard({
  days,
  bookingUrl,
  storyHref,
}: {
  days: FreeWindowDay[];
  bookingUrl: string;
  storyHref: string;
}) {
  const [copied, setCopied] = useState(false);
  const [imageState, setImageState] = useState<"idle" | "loading" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildFreeWindowsShareText(days, bookingUrl));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена недоступен (без HTTPS или запрещён браузером) — текст
      // всё равно виден в карточке, его можно выделить вручную.
    }
  }

  async function handleImage() {
    setImageState("loading");
    try {
      const response = await fetch(storyHref, { cache: "no-store" });
      if (!response.ok) throw new Error(`story ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], "okoshki.png", { type: "image/png" });

      // На телефоне сразу открываем системное «Поделиться» — оттуда картинка
      // уходит в сторис Instagram, Telegram или VK без лишнего сохранения.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (error) {
          // Закрыть меню «Поделиться» — не ошибка.
          if ((error as Error).name !== "AbortError") throw error;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setImageState("idle");
    } catch {
      setImageState("error");
    }
  }

  if (days.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-panel border border-line bg-panel px-5 py-4">
        <CircleCheck size={20} strokeWidth={1.8} className="shrink-0 text-muted" aria-hidden />
        <span className="text-[15px] font-medium text-ink-soft">Ближайшие три дня заняты</span>
      </div>
    );
  }

  const axis = buildFreeWindowsTimelineAxis(days);
  const tickPositions = ["0%", "25%", "50%", "75%", "100%"];
  // В тёмной теме цвет панели совпадает с фоном карточки — дорожка
  // пропадала, поэтому там она цвета линий.
  const trackClassName = "bg-[var(--color-panel)] dark:bg-[var(--color-line)]";

  return (
    <Card className="space-y-5">
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Горящие окошки
        </p>
        <h2 className="text-[22px] font-semibold leading-[1.3] tracking-[-0.025em] text-ink">
          Где в расписании пусто
        </h2>
      </div>

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

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleImage}
          disabled={imageState === "loading"}
          className="gap-2.5 text-[15px]"
        >
          {imageState === "loading" ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <Smartphone size={18} strokeWidth={1.8} />
          )}
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
      {imageState === "error" ? (
        <p role="alert" className="text-sm text-[#c96b5c]">
          Не получилось подготовить картинку. Обнови страницу и попробуй ещё раз.
        </p>
      ) : null}
    </Card>
  );
}
