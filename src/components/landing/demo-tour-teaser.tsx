"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, PlayCircle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

type Rect = { x: number; y: number; w: number; h: number };

type Step = {
  chapter: number;
  caption: string;
  screen: "profile" | "cabinet";
  spot: Rect;
  tap?: { x: number; y: number };
};

// Миниатюра повторяет сам тур: подсветка ходит по экрану, палец нажимает
// окно, и вместо страницы клиента появляется кабинет мастера. Координаты —
// в пикселях экрана мини-телефона (112×220).
const STEPS: Step[] = [
  { chapter: 0, caption: "Имя, фото и специализация", screen: "profile", spot: { x: 5, y: 23, w: 102, h: 58 } },
  { chapter: 0, caption: "Свободные окна видно сразу", screen: "profile", spot: { x: 5, y: 81, w: 102, h: 75 } },
  {
    chapter: 1,
    caption: "Клиент выбирает время сам",
    screen: "profile",
    spot: { x: 11, y: 116, w: 90, h: 20 },
    tap: { x: 90, y: 126 },
  },
  { chapter: 2, caption: "Запись уже в кабинете", screen: "cabinet", spot: { x: 5, y: 69, w: 102, h: 32 } },
];

const CHAPTERS = ["Страница мастера", "Запись клиента", "Кабинет"];
const STEP_MS = 2600;

const spring = { type: "spring", stiffness: 120, damping: 20 } as const;

/**
 * Тизер демо-тура на главной: живая миниатюра тура и переход на /demo/tour.
 * Анимация идёт, только пока блок на экране, и не идёт вовсе при
 * prefers-reduced-motion — тогда стоит первый кадр.
 */
export function DemoTourTeaser({
  layout = "row",
}: {
  /**
   * row — текст и телефон рядом; stack — колонка героя: компактно, телефон рядом
   * с главами, чтобы блок не был выше левой колонки героя.
   */
  layout?: "row" | "stack";
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion || !inView) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, inView]);

  const step = STEPS[index];
  const stacked = layout === "stack";

  const intro = (
    <div className={stacked ? "space-y-2" : "space-y-3"}>
      <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-muted">
        <PlayCircle size={16} className="text-accent-deep" />
        Демо-тур
      </p>
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Посмотри okno глазами мастера и клиента
      </h2>
      {stacked ? null : (
        <p className="text-sm leading-6 text-ink-soft">
          Три короткие главы на настоящих страницах: витрина мастера, запись клиента и
          кабинет. Листаешь сам или включаешь автопросмотр — на телефоне или ноутбуке.
        </p>
      )}
    </div>
  );

  const chapters = (
    <ol className={stacked ? "flex flex-col items-start gap-2" : "flex flex-wrap gap-2"}>
      {CHAPTERS.map((title, chapter) => {
        const active = chapter === step.chapter;
        return (
          <li
            key={title}
            className={`relative rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-500 ${
              active ? "border-transparent text-ink-contrast" : "border-line text-ink-soft"
            }`}
          >
            {active ? (
              <motion.span
                layoutId={`teaser-chapter-${layout}`}
                className="absolute inset-0 rounded-full bg-ink"
                transition={spring}
              />
            ) : null}
            <span className="relative">
              {chapter + 1}. {title}
            </span>
          </li>
        );
      })}
    </ol>
  );

  const caption = (
    <span className="min-h-5 text-sm text-muted" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={step.caption}
          className="inline-block"
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35 }}
        >
          {step.caption}
        </motion.span>
      </AnimatePresence>
    </span>
  );

  const cta = (
    <ButtonLink href="/demo/tour" className={`gap-2 ${stacked ? "w-full justify-center" : ""}`}>
      Смотреть демо-тур
      <ArrowRight size={16} />
    </ButtonLink>
  );

  const phone = (
    <Link
      href="/demo/tour"
      aria-label="Открыть демо-тур"
      className={`block rounded-[30px] transition duration-300 hover:-translate-y-1 ${
        stacked ? "shrink-0" : "mx-auto sm:mx-0"
      }`}
    >
      <MiniPhone step={step} reduceMotion={Boolean(reduceMotion)} />
    </Link>
  );

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-section border border-line shadow-card ${
        stacked ? "h-full p-6" : "p-6 sm:p-7"
      }`}
      style={{ backgroundColor: "var(--ui-card-bg)" }}
    >
      {/* Мягкое свечение за телефоном — блок не должен выглядеть очередной карточкой. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute rounded-full opacity-60 blur-3xl ${
          stacked ? "-left-10 top-1/3 h-72 w-72" : "-right-16 -top-20 h-64 w-64"
        }`}
        style={{ background: "var(--color-accent-soft)" }}
      />

      {stacked ? (
        <div className="relative flex h-full flex-col gap-4">
          {intro}
          <div className="flex flex-1 items-center gap-5">
            {phone}
            <div className="flex min-w-0 flex-col gap-3">
              {chapters}
              {caption}
            </div>
          </div>
          {cta}
        </div>
      ) : (
        <div className="relative grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="space-y-5">
            {intro}
            {chapters}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              {cta}
              {caption}
            </div>
          </div>
          {phone}
        </div>
      )}
    </div>
  );
}

// Внешний размер мини-телефона: экран 112×220 и рамка по 6px.
const PHONE_W = 124;
const PHONE_H = 232;

function MiniPhone({ step, reduceMotion }: { step: Step; reduceMotion: boolean }) {
  return (
    <div style={{ width: PHONE_W, height: PHONE_H }}>
      <MiniPhoneBody step={step} reduceMotion={reduceMotion} />
    </div>
  );
}

function MiniPhoneBody({ step, reduceMotion }: { step: Step; reduceMotion: boolean }) {
  return (
    <div className="rounded-[30px] bg-[#141512] p-[6px] shadow-hover ring-1 ring-white/15">
      <div
        className="relative overflow-hidden rounded-[24px] bg-[var(--color-background)]"
        style={{ width: 112, height: 220 }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={step.screen}
            className="absolute inset-0"
            initial={reduceMotion ? false : { x: 112 }}
            animate={{ x: 0 }}
            exit={reduceMotion ? undefined : { x: -40, opacity: 0 }}
            transition={spring}
          >
            {step.screen === "profile" ? <ProfileScreen /> : <CabinetScreen />}
          </motion.div>
        </AnimatePresence>

        {/* Подсветка: «дырка» в затемнении, как в самом туре. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 rounded-[10px]"
          initial={false}
          animate={{ x: step.spot.x, y: step.spot.y, width: step.spot.w, height: step.spot.h }}
          transition={reduceMotion ? { duration: 0 } : spring}
          style={{ boxShadow: "0 0 0 1.5px rgba(255,255,255,0.95), 0 0 0 400px rgba(16,17,14,0.38)" }}
        />

        <AnimatePresence>
          {step.tap && !reduceMotion ? (
            <motion.span
              key="finger"
              aria-hidden
              className="pointer-events-none absolute h-6 w-6 rounded-full border-2 border-white/90 bg-white/50 shadow-md"
              style={{ left: step.tap.x - 12, top: step.tap.y - 12 }}
              initial={{ opacity: 0, x: 26, y: 70 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: [1, 1, 0.75, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, times: [0, 0.55, 0.75, 1], ease: "easeOut" }}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

const bar = "rounded-full bg-[var(--color-line)]";

function ProfileScreen() {
  return (
    <div className="space-y-[6px] p-[8px]">
      <div className="h-[12px] rounded-full bg-[var(--ui-card-bg)] shadow-subtle" />
      <div className="space-y-[5px] rounded-[10px] bg-[var(--ui-card-bg)] p-[7px] shadow-subtle">
        <div className="flex items-center justify-between">
          <div className={`h-[9px] w-[52px] ${bar} bg-ink/80`} />
          <div className="h-[18px] w-[18px] rounded-full bg-[var(--color-accent)]" />
        </div>
        <div className={`h-[5px] w-[64px] ${bar}`} />
        <div className={`h-[5px] w-[40px] ${bar}`} />
      </div>
      <div className="space-y-[4px] rounded-[10px] bg-[var(--ui-card-bg)] p-[6px] shadow-subtle">
        <div className={`mb-[2px] h-[5px] w-[44px] ${bar}`} />
        {["10:00", "11:30", "14:00"].map((time) => (
          <div key={time} className="flex h-[14px] items-center justify-between rounded-[6px] bg-[var(--color-panel)] px-[5px]">
            <div className={`h-[4px] w-[38px] ${bar}`} />
            <span className="text-[6px] font-semibold text-ink">{time}</span>
          </div>
        ))}
      </div>
      {[0, 1].map((item) => (
        <div key={item} className="space-y-[4px] rounded-[10px] bg-[var(--ui-card-bg)] p-[6px] shadow-subtle">
          <div className={`h-[6px] w-[58px] ${bar} bg-ink/60`} />
          <div className={`h-[4px] w-[78px] ${bar}`} />
        </div>
      ))}
    </div>
  );
}

function CabinetScreen() {
  return (
    <div className="space-y-[6px] p-[8px]">
      <div className="h-[12px] rounded-full bg-[var(--ui-card-bg)] shadow-subtle" />
      <div className={`mt-[4px] h-[8px] w-[70px] ${bar} bg-ink/80`} />
      <div className="grid grid-cols-2 gap-[4px]">
        {[0, 1].map((item) => (
          <div key={item} className="h-[22px] rounded-[8px] bg-[var(--ui-card-bg)] shadow-subtle" />
        ))}
      </div>
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex h-[26px] items-center gap-[5px] rounded-[8px] bg-[var(--ui-card-bg)] px-[6px] shadow-subtle"
        >
          {item === 0 ? (
            <span className="flex h-[12px] w-[12px] items-center justify-center rounded-full bg-[var(--color-success-soft,#e5f1e8)]">
              <Check size={8} className="text-success" />
            </span>
          ) : (
            <span className="h-[12px] w-[12px] rounded-full bg-[var(--color-panel)]" />
          )}
          <div className="flex-1 space-y-[3px]">
            <div className={`h-[4px] w-[46px] ${bar} ${item === 0 ? "bg-ink/70" : ""}`} />
            <div className={`h-[4px] w-[30px] ${bar}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
