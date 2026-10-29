"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Eye, Monitor, Palette, RefreshCw, SlidersHorizontal, Smartphone } from "lucide-react";
import { applyBrandThemeAction } from "@/app/actions/brand-theme";
import { RefineDialog, type RefineMode } from "@/components/brand-style/refine-dialog";
import { DialogClose, Eyebrow, Segmented, WizardDialog } from "@/components/brand-style/ui";
import { WizardFoot } from "@/components/brand-style/wizard";
import { Button } from "@/components/ui/button";
import type { BrandThemeVersion } from "@/lib/brand-theme/drafts";
import { publicLinkHost } from "@/lib/site";
import { cn } from "@/lib/utils";

// 4.10 «Превью»: настоящая страница мастера с черновой темой во фрейме
// (?brandPreview= работает только для владельца), на телефоне и в окне
// браузера. Плюс «Поправить / Сгенерировать заново» (4.11) и «Применить»
// (4.13).

type Device = "phone" | "desktop";
type View = "page" | "booking";

function ScaledFrame({
  src,
  width,
  height,
  title,
}: {
  src: string;
  width: number;
  height: number;
  title: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / width));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={boxRef} className="relative w-full overflow-hidden" style={{ height: height * scale }}>
      {loading ? (
        <div className="absolute inset-0 flex flex-col gap-3 p-6" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span key={index} className="h-24 animate-pulse rounded-panel bg-[var(--color-panel)]" />
          ))}
        </div>
      ) : null}
      <iframe
        src={src}
        title={title}
        onLoad={() => setLoading(false)}
        className="origin-top-left border-0 bg-transparent"
        style={{ width, height, transform: `scale(${scale})`, opacity: loading ? 0 : 1 }}
      />
    </div>
  );
}

export function PreviewScreen({
  username,
  variants,
  selected,
  generationsLeft,
  onSelect,
  onRefined,
  onRegenerate,
  onManual,
  onLimit,
  onApplied,
}: {
  username: string;
  variants: BrandThemeVersion[];
  selected: BrandThemeVersion;
  generationsLeft: number;
  onSelect: (id: string) => void;
  onRefined: (variant: BrandThemeVersion) => void;
  onRegenerate: (comment: string) => void;
  onManual: () => void;
  onLimit: () => void;
  onApplied: () => void;
}) {
  const [device, setDevice] = useState<Device>("phone");
  const [view, setView] = useState<View>("page");
  const [refineMode, setRefineMode] = useState<RefineMode | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, startApply] = useTransition();

  const src = `/${username}${view === "booking" ? "/book" : ""}?brandPreview=${selected.id}`;
  const host = `${publicLinkHost}/${username}`;

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-4 sm:px-8">
        <p className="flex items-center gap-3 rounded-panel border border-accent bg-accent-soft px-4 py-3 text-[13px] text-ink">
          <Eye aria-hidden="true" size={16} className="shrink-0 text-accent-deep" />
          <span>
            <b>Это черновик.</b> Клиенты его не видят, пока вы не нажмёте «Применить».
          </span>
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Segmented
              label="Что показать"
              value={view}
              onChange={setView}
              options={[
                { value: "page", label: "Страница" },
                { value: "booking", label: "Выбор времени" },
              ]}
            />
            {/* На телефоне и так телефон. Обёртка, а не className: cn
                не разрешает конфликт с inline-flex самого переключателя. */}
            <div className="hidden sm:block">
              <Segmented
                label="Устройство"
                value={device}
                onChange={setDevice}
                options={[
                  { value: "phone", label: <><Smartphone size={16} /> Телефон</> },
                  { value: "desktop", label: <><Monitor size={16} /> Компьютер</> },
                ]}
              />
            </div>
          </div>
          {variants.length > 1 ? (
            <div className="flex items-center gap-2">
              <Eyebrow>Вариант</Eyebrow>
              <div className="inline-flex gap-0.5 rounded-full border border-line bg-panel p-1">
                {variants.map((variant, index) => (
                  <button
                    key={variant.id}
                    type="button"
                    aria-pressed={variant.id === selected.id}
                    title={variant.name}
                    onClick={() => onSelect(variant.id)}
                    className={cn(
                      "inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-sm font-medium",
                      variant.id === selected.id
                        ? "border-line bg-surface text-ink shadow-subtle"
                        : "border-transparent text-ink-soft",
                    )}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-ink">
            {selected.name}
            {selected.explanation ? <span className="font-normal text-muted"> · {selected.explanation}</span> : null}
          </p>
          {device === "phone" ? (
            <div className="w-full max-w-[350px] rounded-[48px] border border-line p-2.5 shadow-hover" style={{ backgroundColor: "#23241f" }}>
              <div className="overflow-hidden rounded-[38px] bg-surface">
                {/* key: новый адрес — новый фрейм со своим «загружается». */}
                <ScaledFrame key={src} src={src} width={390} height={760} title="Превью страницы на телефоне" />
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[1180px] overflow-hidden rounded-[22px] border border-line bg-surface shadow-hover">
              <div className="flex items-center gap-3.5 border-b border-line bg-panel px-4 py-3">
                <span className="flex gap-1.5" aria-hidden="true">
                  {[0, 1, 2].map((dot) => (
                    <i key={dot} className="h-[11px] w-[11px] rounded-full bg-[var(--color-line)]" />
                  ))}
                </span>
                <span className="mx-auto w-full max-w-[420px] truncate rounded-full border border-line bg-surface px-4 py-1.5 text-center text-[13px] text-ink-soft">
                  {host}
                </span>
              </div>
              <ScaledFrame key={src} src={src} width={1280} height={820} title="Превью страницы на компьютере" />
            </div>
          )}
        </div>
      </main>

      <WizardFoot
        left={
          <div className="flex gap-1 sm:gap-2">
            <Button variant="ghost" onClick={onManual} className="gap-2 px-3">
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Настроить вручную</span>
              <span className="sm:hidden">Вручную</span>
            </Button>
            <Button variant="secondary" onClick={() => setRefineMode("refine")}>
              Поправить
            </Button>
            {/* На телефоне «Сгенерировать заново» — вторая вкладка «Поправить». */}
            <span className="hidden sm:inline-flex">
              <Button variant="secondary" onClick={() => setRefineMode("regen")} className="gap-2">
                <RefreshCw size={16} />
                Сгенерировать заново
              </Button>
            </span>
          </div>
        }
      >
        <Button onClick={() => setApplyOpen(true)} className="whitespace-nowrap">
          <span className="sm:hidden">Применить</span>
          <span className="hidden sm:inline">Применить стиль</span>
        </Button>
      </WizardFoot>

      {refineMode ? (
        <RefineDialog
          open
          initialMode={refineMode}
          variant={selected}
          generationsLeft={generationsLeft}
          onClose={() => setRefineMode(null)}
          onRefined={onRefined}
          onRegenerate={onRegenerate}
          onLimit={onLimit}
        />
      ) : null}

      <WizardDialog open={applyOpen} onClose={() => !applying && setApplyOpen(false)} labelledBy="apply-title">
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-accent bg-accent-soft text-accent-deep">
            <Palette aria-hidden="true" size={20} strokeWidth={1.6} />
          </span>
          <DialogClose onClick={() => !applying && setApplyOpen(false)} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 id="apply-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
            Применить фирменный стиль?
          </h2>
          <p className="text-sm text-ink-soft">
            Клиенты увидят его сразу. Вернуть стандартный пресет можно в любой момент.
          </p>
        </div>
        {applyError ? <p className="text-sm text-[var(--color-danger)]">{applyError}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setApplyOpen(false)} disabled={applying}>
            Пока нет
          </Button>
          <Button
            disabled={applying}
            onClick={() =>
              startApply(async () => {
                setApplyError(null);
                const result = await applyBrandThemeAction(selected.id);
                if (result.success) {
                  setApplyOpen(false);
                  onApplied();
                } else {
                  setApplyError(result.message);
                }
              })
            }
          >
            {applying ? "Применяем…" : "Применить"}
          </Button>
        </div>
      </WizardDialog>
    </>
  );
}
