"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Info, Lock, Palette, Smartphone, TriangleAlert, Upload } from "lucide-react";
import { resetBrandThemeAction } from "@/app/actions/brand-theme";
import { BrandMiniPreview } from "@/components/brand-theme/brand-mini-preview";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import type { BookingThemePresetId } from "@/lib/booking-theme-presets";
import { brandThemeSamples } from "@/lib/brand-theme/samples";
import type { BrandTheme } from "@/lib/brand-theme/schema";
import { brandThemeFreeGenerationsPerMonth } from "@/lib/brand-theme/limits";

// Карточка «Фирменный стиль» над пресетами (макеты 4.0-A/B/C и 4.16):
//   A — тарифа нет и стиля нет: что это и где подключить;
//   B — тариф есть, стиля нет: приглашение и счётчик генераций;
//   C — стиль применён: миниатюра, счётчик, «Изменить» и откат к пресету;
//   D — стиль применён, но тариф кончился: стиль остаётся на странице,
//       менять нельзя до продления, откат к пресету доступен всегда.

export type BrandThemeEntryState = "A" | "B" | "C" | "D";

const tariffHref = "/settings?tab=account";

export function resolveBrandThemeEntryState(input: {
  hasAccess: boolean;
  hasTheme: boolean;
}): BrandThemeEntryState {
  if (input.hasTheme) return input.hasAccess ? "C" : "D";
  return input.hasAccess ? "B" : "A";
}

function formatDay(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // «23 октября 2026», без «г.»: дата стоит и внутри предложения с точкой.
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(date)
    .replace(/\s?г\.$/, "");
}

function pluralGenerations(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "генерация";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "генерации";
  return "генераций";
}

function GenerationsCounter({ left, variant }: { left: number; variant: "month" | "left" }) {
  const total = brandThemeFreeGenerationsPerMonth;
  const label =
    variant === "month"
      ? `${left} ${pluralGenerations(left)} в этом месяце`
      : `Осталось ${left} ${pluralGenerations(left)} из ${total}`;

  return (
    <span className="inline-flex min-h-8 items-center gap-2.5 whitespace-nowrap rounded-full border border-line bg-surface py-1 pl-3 pr-3.5 text-[13px] font-medium text-ink-soft">
      <span aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <i
            key={index}
            className="inline-block h-2 w-2 rounded-full border-[1.5px] border-accent-deep"
            style={index < left ? { backgroundColor: "var(--color-accent-deep)" } : undefined}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

function IconBubble({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "neutral" }) {
  return (
    <span
      className={
        tone === "accent"
          ? "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent bg-accent-soft text-accent-deep"
          : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-ink-soft"
      }
    >
      {children}
    </span>
  );
}

export function BrandThemeEntry({
  state,
  theme,
  appliedAt,
  subscriptionUntil,
  presetId,
  masterName,
  generationsLeft,
}: {
  state: BrandThemeEntryState;
  theme: BrandTheme | null;
  appliedAt: string | null;
  subscriptionUntil: string | null;
  presetId: BookingThemePresetId;
  masterName: string;
  generationsLeft: number;
}) {
  const [view, setView] = useState<"entry" | "intro">("entry");
  const [notice, setNotice] = useState<string | null>(null);
  const [isResetting, startReset] = useTransition();
  const firstName = masterName.split(" ")[0] || masterName;

  const reset = () => {
    startReset(async () => {
      const result = await resetBrandThemeAction();
      setNotice(result.message);
    });
  };

  if (view === "intro") {
    return (
      <BrandThemeIntroPanel
        generationsLeft={generationsLeft}
        onBack={() => setView("entry")}
        onStart={() => {
          setView("entry");
          // Мастер загрузки материалов (4.2–4.10) — следующий этап, макетов
          // ещё нет. До тех пор вкладка видна только вне продакшена.
          setNotice("Загрузка материалов появится на следующем этапе разработки.");
        }}
      />
    );
  }

  return (
    <>
      {state === "A" ? (
        <section
          aria-labelledby="brand-theme-title"
          className="flex flex-col gap-8 rounded-card border border-line bg-surface p-6 md:flex-row md:items-center"
        >
          <div className="flex flex-1 flex-col gap-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <IconBubble tone="neutral">
                <Lock size={20} strokeWidth={1.6} />
              </IconBubble>
              <Badge>Тарифы «Расширенный» и «Студия»</Badge>
            </div>
            <h2 id="brand-theme-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              Фирменный стиль
            </h2>
            <p className="max-w-[520px] text-ink-soft">
              Ваши цвета, шрифты и логотип на странице записи. Порядок блоков и
              запись для клиентов остаются прежними.
            </p>
            <div>
              <ButtonLink href={tariffHref} className="w-full sm:w-auto">
                Подключить на тарифе «Расширенный»
              </ButtonLink>
            </div>
            <p className="text-xs text-muted">Готовые пресеты ниже работают на любом тарифе.</p>
          </div>
          <div className="flex items-center justify-center gap-3.5 self-center">
            <figure className="flex flex-col items-center gap-2">
              <BrandMiniPreview theme={null} presetId={presetId} name={firstName} />
              <figcaption className="text-xs text-muted">Сейчас</figcaption>
            </figure>
            <ArrowRight aria-hidden="true" size={20} className="text-muted" />
            <figure className="flex flex-col items-center gap-2">
              <BrandMiniPreview theme={brandThemeSamples.rose} name={firstName} locked />
              <figcaption className="text-xs text-muted">С фирменным стилем</figcaption>
            </figure>
          </div>
        </section>
      ) : null}

      {state === "B" ? (
        <section
          aria-labelledby="brand-theme-title"
          className="flex flex-col gap-7 rounded-card border border-line bg-surface p-6 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-start gap-[18px]">
            <IconBubble>
              <Palette size={20} strokeWidth={1.6} />
            </IconBubble>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Новое</span>
              <h2 id="brand-theme-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                Фирменный стиль
              </h2>
              <p className="max-w-[560px] text-ink-soft">
                Загрузите брендбук или опишите стиль словами — соберём оформление
                вашей страницы записи.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 md:items-end">
            <GenerationsCounter left={generationsLeft} variant="month" />
            <Button onClick={() => setView("intro")} className="w-full md:w-auto">
              Создать фирменный стиль
            </Button>
          </div>
        </section>
      ) : null}

      {state === "C" || state === "D" ? (
        <section
          aria-labelledby="brand-theme-title"
          className="flex flex-col gap-7 rounded-card border border-line bg-surface p-6 md:flex-row md:items-center"
        >
          <BrandMiniPreview theme={theme} name={firstName} className="self-center" />
          <div className="flex flex-1 flex-col gap-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Активен</Badge>
              {state === "D" ? <Badge tone="warning">Тариф истёк</Badge> : null}
              {formatDay(appliedAt) ? (
                <span className="text-xs text-muted">Применён {formatDay(appliedAt)}</span>
              ) : null}
            </div>
            <h2 id="brand-theme-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              Фирменный стиль
            </h2>
            <p className="max-w-[560px] text-ink-soft">
              Цвета, шрифты и декор из вашего брендбука действуют на странице записи.
            </p>

            {state === "C" ? (
              <>
                <div>
                  <GenerationsCounter left={generationsLeft} variant="left" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => setView("intro")}>
                    Изменить
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={isResetting}>
                    {isResetting ? "Возвращаю..." : "Вернуть стандартный пресет"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div
                  className="flex items-start gap-3 rounded-panel border p-4 text-ink"
                  style={{
                    backgroundColor: "var(--color-warning-soft)",
                    borderColor: "var(--color-warning)",
                  }}
                >
                  <TriangleAlert aria-hidden="true" size={20} strokeWidth={1.6} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
                  <p className="text-[13px] leading-[1.45]">
                    {formatDay(subscriptionUntil)
                      ? `Тариф закончился ${formatDay(subscriptionUntil)}.`
                      : "Тариф закончился."}{" "}
                    Стиль остаётся на странице записи, но изменить его нельзя до продления.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <ButtonLink href={tariffHref}>Продлить тариф</ButtonLink>
                  <Button variant="secondary" disabled className="gap-2 opacity-40">
                    <Lock aria-hidden="true" size={16} strokeWidth={1.6} />
                    Изменить
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={isResetting}>
                    {isResetting ? "Возвращаю..." : "Вернуть стандартный пресет"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {notice ? (
        <p role="status" className="text-sm text-ink-soft">
          {notice}
        </p>
      ) : null}

    </>
  );
}

const steps = [
  {
    icon: Upload,
    title: "Загрузите, что есть",
    text: "Брендбук, логотип, цвета или скриншоты вашего канала.",
  },
  {
    icon: Palette,
    title: "Выберите одну палитру из трёх",
    text: "Подберём варианты и проверим, что текст везде читается.",
  },
  {
    icon: Smartphone,
    title: "Посмотрите и примените",
    text: "Страница на телефоне и компьютере. Клиенты увидят её, только когда вы нажмёте «Применить».",
  },
] as const;

// Вступление (макет 4.1). Живёт внутри окна «Оформление страницы» как
// отдельный вид, а не вторым окном поверх: туда же дальше встанут шаги
// мастера загрузки (4.2–4.10).
function BrandThemeIntroPanel({
  generationsLeft,
  onBack,
  onStart,
}: {
  generationsLeft: number;
  onBack: () => void;
  onStart: () => void;
}) {
  const noGenerations = generationsLeft === 0;

  return (
    <section aria-labelledby="brand-theme-intro-title" className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Фирменный стиль</span>
        <h3 id="brand-theme-intro-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          Как это работает
        </h3>
        <p className="text-ink-soft">Три коротких шага. Займёт несколько минут.</p>
      </div>

      <ol className="flex flex-col gap-[18px]">
        {steps.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-4">
            <IconBubble>
              <Icon size={20} strokeWidth={1.6} />
            </IconBubble>
            <div>
              <p className="text-base font-semibold leading-[1.3] text-ink">{title}</p>
              <p className="text-[13px] leading-[1.45] text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-start gap-3 rounded-panel border border-accent bg-accent-soft p-4">
        <Info aria-hidden="true" size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent-deep" />
        <p className="text-[13px] leading-[1.45] text-ink">
          Меняется только оформление. Порядок блоков и запись для клиентов остаются прежними.
        </p>
      </div>

      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <GenerationsCounter left={generationsLeft} variant="month" />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onBack}>
            Не сейчас
          </Button>
          <Button onClick={onStart} disabled={noGenerations}>
            Начать
          </Button>
        </div>
      </div>
    </section>
  );
}
