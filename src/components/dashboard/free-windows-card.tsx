"use client";

import { useState } from "react";
import { Check, Copy, Flame, ImageDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildFreeWindowsShareText,
  formatFreeWindowRanges,
  type FreeWindowDay,
} from "@/lib/free-windows";

// Горящие окошки (документы/горящие-окошки.md): свободное время на ближайшие
// три дня и две кнопки, чтобы поделиться им в сторис и мессенджерах.
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

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <Flame size={18} className="mt-1.5 shrink-0 text-warning" />
        <div>
          <h2 className="text-2xl font-semibold text-ink">Горящие окошки</h2>
          <p className="text-sm text-muted">
            Свободное время на ближайшие дни. Поделись им в сторис или в чате с клиентами.
          </p>
        </div>
      </div>

      {days.length > 0 ? (
        <>
          <ul className="space-y-2">
            {days.map((day) => (
              <li key={day.date} className="rounded-panel bg-panel px-4 py-3">
                <p className="text-sm font-medium text-ink">{day.label}</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {formatFreeWindowRanges(day.windows)}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleImage} disabled={imageState === "loading"} className="gap-2">
              {imageState === "loading" ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <ImageDown size={16} />
              )}
              Картинка для сторис
            </Button>
            <Button variant="secondary" onClick={handleCopy} className="gap-2">
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              {copied ? "Скопировано" : "Скопировать текст"}
            </Button>
          </div>
          {imageState === "error" ? (
            <p role="alert" className="text-sm text-[#c96b5c]">
              Не получилось подготовить картинку. Обнови страницу и попробуй ещё раз.
            </p>
          ) : null}
        </>
      ) : (
        <div className="rounded-nested border border-dashed border-line p-5 text-sm text-muted">
          Ближайшие три дня заняты — делиться пока нечем.
        </div>
      )}
    </Card>
  );
}
