"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  bookingThemePresets,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";
import { cn } from "@/lib/utils";

// Заливка + затухание укладываются в ~2.2 с.
const FILL_MS = 1600;
const FADE_MS = 600;

type DemoThemeSwitcherProps = {
  value: BookingThemePresetId;
  onApply: (presetId: BookingThemePresetId) => void;
};

/**
 * Выбор оформления страницы в демо-туре.
 *
 * Смена пресета — это подмена набора CSS-переменных, то есть мгновенная.
 * Мгновенная перекраска целой страницы читается как сбой, поэтому поверх
 * кладётся слой с фоном НОВОЙ темы и раскрывается сверху вниз от самого
 * виджета: цвет как будто стекает по странице. Под слоем тема уже переключена,
 * так что после его исчезновения ничего не «прыгает».
 *
 * Слой помечен своим data-booking-theme и красится через var(--color-background),
 * поэтому в тёмной теме заливка идёт тёмным вариантом пресета сама собой —
 * никакой таблицы цветов заводить не пришлось.
 */
export function DemoThemeSwitcher({ value, onApply }: DemoThemeSwitcherProps) {
  const shouldReduceMotion = useReducedMotion();
  const anchorRef = useRef<HTMLDivElement>(null);

  const [pending, setPending] = useState<BookingThemePresetId | null>(null);
  const [covered, setCovered] = useState(false);
  const [startPct, setStartPct] = useState(18);

  const select = (presetId: BookingThemePresetId) => {
    if (presetId === value || pending) return;

    if (shouldReduceMotion) {
      onApply(presetId);
      return;
    }

    // Заливка стартует от нижней кромки виджета — оттуда, куда человек
    // только что нажал.
    const rect = anchorRef.current?.getBoundingClientRect();
    const pct = rect
      ? Math.min(92, Math.max(4, (rect.bottom / window.innerHeight) * 100))
      : 18;

    setStartPct(pct);
    setCovered(false);
    setPending(presetId);
  };

  // Фазы ведут таймеры, а не onAnimationComplete. Анимация держится на
  // requestAnimationFrame, а он не идёт в фоновой вкладке: свернул страницу
  // на середине заливки — и колбэк не придёт никогда, слой останется висеть
  // поверх контента. setTimeout в фоне лишь подтормаживает, но срабатывает.
  useEffect(() => {
    if (!pending || covered) return;
    const timer = setTimeout(() => {
      onApply(pending);
      setCovered(true);
    }, FILL_MS);
    return () => clearTimeout(timer);
  }, [pending, covered, onApply]);

  useEffect(() => {
    if (!covered) return;
    const timer = setTimeout(() => {
      setPending(null);
      setCovered(false);
    }, FADE_MS);
    return () => clearTimeout(timer);
  }, [covered]);

  return (
    <>
      <div ref={anchorRef} className="mt-12">
        <div className="rounded-section border border-line bg-glass p-5 shadow-card backdrop-blur sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted">
            Шаг 0 · Оформление
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Мастер выбирает цвет своей страницы
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            Пресет применяется ко всему клиентскому пути: профиль, запись и экран
            подтверждения. Нажми на любой — страница перекрасится прямо сейчас.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {bookingThemePresets.map((preset) => {
              const isActive = preset.id === value;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => select(preset.id)}
                  aria-pressed={isActive}
                  disabled={Boolean(pending)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-medium transition duration-300",
                    "disabled:cursor-not-allowed",
                    isActive
                      ? "border-ink bg-ink text-ink-contrast"
                      : "border-line bg-[var(--ui-field-bg)] text-ink hover:-translate-y-0.5",
                  )}
                >
                  <span className="flex shrink-0 gap-1">
                    {preset.swatches.map((swatch, index) => (
                      <span
                        key={`${preset.id}-${index}`}
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </span>
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {pending ? (
        <motion.div
          data-booking-theme={pending}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[45] bg-[var(--color-background)]"
          initial={{
            clipPath: `inset(${startPct}% 0% ${100 - startPct}% 0%)`,
            opacity: 1,
          }}
          animate={
            covered
              ? { clipPath: "inset(0% 0% 0% 0%)", opacity: 0 }
              : { clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }
          }
          transition={
            covered
              ? { duration: FADE_MS / 1000, ease: "easeOut" }
              : { duration: FILL_MS / 1000, ease: [0.22, 1, 0.36, 1] }
          }
        />
      ) : null}
    </>
  );
}
