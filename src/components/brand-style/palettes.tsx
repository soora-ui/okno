"use client";

import { useRef, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { PhoneMock, type MockMaster } from "@/components/brand-style/phone-mock";
import { RefineDialog } from "@/components/brand-style/refine-dialog";
import { Badge, Eyebrow, StepTitle } from "@/components/brand-style/ui";
import { WizardBody, WizardFoot } from "@/components/brand-style/wizard";
import { Button } from "@/components/ui/button";
import type { BrandThemeVersion } from "@/lib/brand-theme/drafts";
import { cn } from "@/lib/utils";

// 4.8 «Выберите палитру»: три варианта, в каждом — страница мастера в
// миниатюре. На телефоне — карусель со свайпом.

const roles = [
  ["background", "Фон"],
  ["card", "Карточки"],
  ["ink", "Текст"],
  ["accent", "Акцент"],
  ["button", "Кнопка"],
] as const;

export function PalettesScreen({
  variants,
  selectedId,
  master,
  generationsLeft,
  onSelect,
  onRegenerate,
  onLimit,
  onContinue,
}: {
  variants: BrandThemeVersion[];
  selectedId: string | null;
  master: MockMaster;
  generationsLeft: number;
  onSelect: (id: string) => void;
  onRegenerate: (comment: string) => void;
  onLimit: () => void;
  onContinue: () => void;
}) {
  const [regenOpen, setRegenOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const shown = variants.slice(0, 3);

  return (
    <>
      <WizardBody wide>
        <StepTitle
          eyebrow="Палитра"
          title="Выберите палитру"
          sub="Мы собрали три варианта. В каждом показана ваша страница записи: так будет видно, как цвета работают вместе."
        />
        <div
          ref={rowRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            const index = Math.round(element.scrollLeft / (element.scrollWidth / shown.length));
            setSlide(Math.min(Math.max(index, 0), shown.length - 1));
          }}
          className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-3 pt-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {shown.map((variant, index) => {
            const on = variant.id === selectedId;
            return (
              <button
                key={variant.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(variant.id)}
                className={cn(
                  "flex shrink-0 basis-[84%] snap-center flex-col gap-4 rounded-card border bg-surface p-5 text-left shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-hover sm:basis-auto",
                  on ? "border-[var(--color-accent-deep)] outline outline-2 -outline-offset-1 outline-[var(--color-accent-deep)]" : "border-line",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow>Вариант {index + 1}</Eyebrow>
                  {on ? (
                    <Badge tone="sage">
                      <Check size={12} /> Выбрано
                    </Badge>
                  ) : null}
                </div>
                <div className="flex justify-center">
                  <PhoneMock theme={variant.theme} scope={`pal-${index}`} master={master} width={196} height={300} />
                </div>
                <div className="flex justify-between gap-1">
                  {roles.map(([role, label]) => (
                    <span key={role} className="flex flex-col items-center gap-1.5 text-center text-[11px] leading-tight text-muted">
                      <span className="h-9 w-9 rounded-full border border-black/15" style={{ backgroundColor: variant.theme.colors[role] }} />
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-ink">{variant.name}</span>
                  <span className="text-[13px] text-ink-soft">{variant.explanation}</span>
                </div>
                <span>
                  <Badge tone="ok">
                    <ShieldCheck size={12} /> Читаемость проверена
                  </Badge>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-2 sm:hidden" aria-hidden="true">
          {shown.map((variant, index) => (
            <i
              key={variant.id}
              className={cn("h-2 rounded-full transition-all", index === slide ? "w-[22px]" : "w-2 bg-[var(--color-line)]")}
              style={index === slide ? { backgroundColor: "var(--color-accent-deep)" } : undefined}
            />
          ))}
        </div>
      </WizardBody>
      <WizardFoot
        left={
          <Button variant="ghost" onClick={() => setRegenOpen(true)}>
            Ни один не подходит
          </Button>
        }
      >
        <Button onClick={onContinue} disabled={!selectedId}>
          Выбрать и оформить страницу
        </Button>
      </WizardFoot>
      <RefineDialog
        open={regenOpen}
        initialMode="regen"
        variant={null}
        generationsLeft={generationsLeft}
        onClose={() => setRegenOpen(false)}
        onRefined={() => undefined}
        onRegenerate={onRegenerate}
        onLimit={onLimit}
      />
    </>
  );
}
