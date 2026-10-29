"use client";

import { Clock3, Info } from "lucide-react";
import { DialogClose, GenerationsCounter, WizardDialog } from "@/components/brand-style/ui";
import { Button } from "@/components/ui/button";

// 4.14 «Бесплатные генерации на этот месяц закончились». Пакеты в макете
// есть, но цены не решены — пока окно честно говорит, когда появятся новые,
// и ведёт в то, что работает без генераций.

function nextMonthStart() {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(first);
}

export function LimitDialog({
  open,
  onClose,
  onManual,
}: {
  open: boolean;
  onClose: () => void;
  // null — настраивать пока нечего (вариантов ещё нет).
  onManual: (() => void) | null;
}) {
  return (
    <WizardDialog open={open} onClose={onClose} labelledBy="limit-title">
      <div className="flex items-start gap-3.5">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-warning" style={{ backgroundColor: "var(--color-warning-soft)", borderColor: "var(--color-warning)" }}>
          <Clock3 aria-hidden="true" size={20} strokeWidth={1.6} />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="limit-title" className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink">
            Бесплатные генерации на этот месяц закончились
          </h2>
          <p className="text-sm text-muted">Новые появятся {nextMonthStart()}.</p>
        </div>
        <DialogClose onClick={onClose} />
      </div>
      <div>
        <GenerationsCounter left={0} label="0 из 3 в этом месяце" />
      </div>
      <p className="flex items-start gap-3 rounded-panel border border-accent bg-accent-soft p-4 text-[13px] text-ink">
        <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-accent-deep" />
        «Настроить вручную» и «Поправить» не тратят генерации и работают без ограничений месяца.
      </p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
        {onManual ? (
          <Button variant="secondary" onClick={onManual}>
            Настроить вручную
          </Button>
        ) : null}
      </div>
    </WizardDialog>
  );
}
