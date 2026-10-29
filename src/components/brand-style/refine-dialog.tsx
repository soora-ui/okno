"use client";

import { useState } from "react";
import { MousePointerClick, TriangleAlert } from "lucide-react";
import { BrandApiError, refineVariant } from "@/components/brand-style/api";
import {
  Badge,
  Chip,
  DialogClose,
  Eyebrow,
  GenerationsCounter,
  Segmented,
  Spinner,
  WizardDialog,
} from "@/components/brand-style/ui";
import { Button } from "@/components/ui/button";
import type { BrandThemeVersion } from "@/lib/brand-theme/drafts";
import {
  brandRefineChips,
  brandRefineTargets,
  type BrandRefineChip,
  type BrandRefineTarget,
} from "@/lib/brand-theme/refine-options";

// 4.11 «Изменить оформление»: «Поправить» (бесплатно) и «Сгенерировать
// заново». На экране палитр (4.8, «Ни один не подходит») открывается сразу
// на второй вкладке, а «Поправить» там нечего — варианта ещё нет.

export type RefineMode = "refine" | "regen";

export function RefineDialog({
  open,
  initialMode,
  variant,
  generationsLeft,
  onClose,
  onRefined,
  onRegenerate,
  onLimit,
}: {
  open: boolean;
  initialMode: RefineMode;
  variant: BrandThemeVersion | null;
  generationsLeft: number;
  onClose: () => void;
  onRefined: (variant: BrandThemeVersion) => void;
  onRegenerate: (comment: string) => void;
  onLimit: () => void;
}) {
  const [mode, setMode] = useState<RefineMode>(initialMode);
  const [chips, setChips] = useState<BrandRefineChip[]>([]);
  const [target, setTarget] = useState<BrandRefineTarget | null>(null);
  const [comment, setComment] = useState("");
  const [regenComment, setRegenComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const applyRefine = async () => {
    if (!variant) return;
    setPending(true);
    setError(null);
    try {
      const result = await refineVariant({ themeId: variant.id, chips, comment, target });
      setChips([]);
      setComment("");
      setTarget(null);
      onRefined(result.variant);
      onClose();
    } catch (refineError) {
      setError(refineError instanceof BrandApiError ? refineError.message : "Не получилось внести правку.");
    } finally {
      setPending(false);
    }
  };

  const canRefine = chips.length > 0 || comment.trim() !== "" || target !== null;

  return (
    <WizardDialog open={open} onClose={close} labelledBy="refine-title" wide>
      <div className="flex items-start justify-between gap-4">
        <h2 id="refine-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          Изменить оформление
        </h2>
        <DialogClose onClick={close} />
      </div>

      {variant ? (
        <Segmented
          label="Как изменить"
          value={mode}
          onChange={setMode}
          className="w-full"
          options={[
            {
              value: "refine",
              label: (
                <>
                  Поправить <Badge tone="ok">Бесплатно</Badge>
                </>
              ),
            },
            { value: "regen", label: "Сгенерировать заново" },
          ]}
        />
      ) : null}

      {mode === "refine" && variant ? (
        <>
          <p className="text-[13px] text-ink-soft">
            Точечные изменения к текущему варианту. Генерации не тратятся.
          </p>
          <div className="flex flex-col gap-2.5">
            <Eyebrow>Быстрые правки</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {brandRefineChips.map((chip) => (
                <Chip
                  key={chip}
                  on={chips.includes(chip)}
                  onClick={() =>
                    setChips((current) =>
                      current.includes(chip) ? current.filter((item) => item !== chip) : [...current, chip],
                    )
                  }
                >
                  {chip}
                </Chip>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              Что изменить? <span className="text-xs font-normal text-muted">Необязательно</span>
            </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Например: сделать шапку светлее"
              className="min-h-[72px] w-full rounded-field border border-line bg-[var(--ui-field-bg)] outline-none focus:border-[var(--color-accent-deep)] focus:shadow-[0_0_0_2px_var(--color-accent-deep)] px-4 py-3 text-[15px] text-ink placeholder:text-[var(--ui-placeholder)]"
            />
          </label>
          <div className="flex flex-col gap-3 rounded-panel border border-line bg-panel p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-soft">
                <MousePointerClick aria-hidden="true" size={16} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-ink">Выбрать элемент на странице</span>
                <span className="text-xs text-muted">Комментарий привяжется к выбранному месту</span>
              </div>
              {target && !picking ? (
                <button type="button" onClick={() => setPicking(true)}>
                  <Badge tone="sage">{brandRefineTargets[target]}</Badge>
                </button>
              ) : !picking ? (
                <Button variant="secondary" className="min-h-9 px-3 py-1" onClick={() => setPicking(true)}>
                  Выбрать
                </Button>
              ) : null}
            </div>
            {picking ? (
              <div className="flex flex-wrap gap-2">
                {(Object.keys(brandRefineTargets) as BrandRefineTarget[]).map((key) => (
                  <Chip
                    key={key}
                    on={target === key}
                    onClick={() => {
                      setTarget(target === key ? null : key);
                      setPicking(false);
                    }}
                  >
                    {brandRefineTargets[key]}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
          {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={close} disabled={pending}>
              Отмена
            </Button>
            <Button onClick={applyRefine} disabled={!canRefine || pending} className="gap-2 disabled:opacity-40">
              {pending ? <Spinner className="h-4 w-4 border-2" /> : null}
              {pending ? "Вносим правки…" : "Применить правки"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-ink-soft">
            Соберём новый вариант с нуля. Текущий сохранится в истории версий, к нему можно вернуться.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              Что не понравилось? <span className="text-xs font-normal text-muted">Необязательно</span>
            </span>
            <textarea
              value={regenComment}
              onChange={(event) => setRegenComment(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Можно без комментария. С ним получится точнее."
              className="min-h-[88px] w-full rounded-field border border-line bg-[var(--ui-field-bg)] outline-none focus:border-[var(--color-accent-deep)] focus:shadow-[0_0_0_2px_var(--color-accent-deep)] px-4 py-3 text-[15px] text-ink placeholder:text-[var(--ui-placeholder)]"
            />
          </label>
          {generationsLeft > 0 ? (
            <div className="flex flex-col gap-2.5 rounded-panel border p-4" style={{ backgroundColor: "var(--color-warning-soft)", borderColor: "var(--color-warning)" }}>
              <p className="flex items-center gap-2.5 text-[13px] font-semibold text-ink">
                <TriangleAlert aria-hidden="true" size={16} className="shrink-0 text-warning" />
                Спишется 1 генерация, останется {generationsLeft - 1}.
              </p>
              <div>
                <GenerationsCounter left={generationsLeft - 1} label={`${generationsLeft - 1} из 3 после списания`} />
              </div>
            </div>
          ) : null}
          <p className="text-xs text-muted">Поправить вручную или точечно можно и без генераций.</p>
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={close}>
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (generationsLeft <= 0) {
                  onClose();
                  onLimit();
                  return;
                }
                onClose();
                onRegenerate(regenComment);
              }}
            >
              Сгенерировать заново
            </Button>
          </div>
        </>
      )}
    </WizardDialog>
  );
}
