"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  bookingThemePresets,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";
import { cn } from "@/lib/utils";

// Заливка медленная намеренно: это витринный жест, а не отклик на действие.
const FILL_MS = 2200;
// Поверхности догоняют фон плавным переходом, а не скачком.
const SETTLE_MS = 600;

type Origin = { x: number; y: number; radius: number };

type DemoThemeSwitcherProps = {
  value: BookingThemePresetId;
  onApply: (presetId: BookingThemePresetId) => void;
};

/**
 * Выбор оформления страницы в демо-туре.
 *
 * Смена пресета — подмена набора CSS-переменных, то есть мгновенная. Чтобы
 * это не читалось как сбой, новый фон растекается кругом от нажатой кнопки.
 *
 * Ключевое: слой заливки лежит ПОЗАДИ контента (-z-10), а не поверх него.
 * Карточки и текст остаются видимыми и ничем не перекрываются. Отрицательный
 * z-index работает потому, что main спозиционирован как relative без z-index
 * и своего контекста наложения не создаёт: слой ложится выше фона main, но
 * ниже всего содержимого.
 *
 * Красим акцентом пресета, а не фоном: фон у четырёх пресетов из пяти один и
 * тот же (#faf7f1), и заливка им была бы попросту невидима. Отличает пресеты
 * как раз акцент — бордо, лагуна, олива. Волна идёт полупрозрачной, чтобы
 * читалась как подкраска страницы, а не как заслонка, и в конце растворяется,
 * оставляя уже применённую тему.
 *
 * Радиус считается до самого дальнего угла вьюпорта — иначе круг не накроет
 * экран целиком при нажатии на кнопку у края.
 *
 * Слой помечен своим data-booking-theme, поэтому в тёмной теме сам берёт
 * осветлённый акцент тёмной пары.
 */
export function DemoThemeSwitcher({ value, onApply }: DemoThemeSwitcherProps) {
  const shouldReduceMotion = useReducedMotion();

  const [pending, setPending] = useState<BookingThemePresetId | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [settling, setSettling] = useState(false);

  const select = (
    presetId: BookingThemePresetId,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (presetId === value || pending) return;

    if (shouldReduceMotion) {
      onApply(presetId);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // Расстояние до дальнего угла: круг обязан накрыть весь вьюпорт.
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    setOrigin({ x, y, radius });
    setSettling(false);
    setPending(presetId);
  };

  // Фазы ведут таймеры, а не onAnimationComplete: анимация держится на
  // requestAnimationFrame, а он не идёт в фоновой вкладке. Свернул страницу
  // на середине заливки — колбэк не пришёл бы никогда, и слой завис бы.
  useEffect(() => {
    if (!pending || settling) return;
    const timer = setTimeout(() => {
      onApply(pending);
      setSettling(true);
    }, FILL_MS);
    return () => clearTimeout(timer);
  }, [pending, settling, onApply]);

  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => {
      setPending(null);
      setSettling(false);
      setOrigin(null);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settling]);

  return (
    <>
      {/* mb-10: без него виджет упирался в блок профиля вплотную. */}
      <div className="mt-12 mb-10">
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
                  onClick={(event) => select(preset.id, event)}
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

      {pending && origin ? (
        <>
          {/* Круговая волна акцента. Позади контента — ничего не перекрывает. */}
          <motion.div
            data-booking-theme={pending}
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10 bg-[var(--color-accent)]"
            initial={{
              clipPath: `circle(0px at ${origin.x}px ${origin.y}px)`,
              opacity: 0.5,
            }}
            animate={{
              clipPath: `circle(${Math.ceil(origin.radius)}px at ${origin.x}px ${origin.y}px)`,
              // Волна растворяется только когда тема уже применена, иначе
              // страница на миг осталась бы вообще без подкраски.
              opacity: settling ? 0 : 0.5,
            }}
            transition={
              settling
                ? { duration: SETTLE_MS / 1000, ease: "easeOut" }
                : { duration: FILL_MS / 1000, ease: [0.33, 0, 0.2, 1] }
            }
          />

          {/* Пока идёт заливка, карточки и текст догоняют новый фон плавно:
              без этого в момент смены пресета они перекрашивались рывком. */}
          <style>{`[data-booking-theme] *{transition:background-color ${SETTLE_MS}ms ease,border-color ${SETTLE_MS}ms ease,color ${SETTLE_MS}ms ease,fill ${SETTLE_MS}ms ease}`}</style>
        </>
      ) : null}
    </>
  );
}
