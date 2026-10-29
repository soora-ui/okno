"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Check, FileText, ImageIcon, Upload, X } from "lucide-react";
import { brandThemeFreeGenerationsPerMonth } from "@/lib/brand-theme/limits";
import { cn } from "@/lib/utils";

// Элементы мастера фирменного стиля по okno.css макетов (4.2–4.16).
// Значения перенесены как есть: чип 44px, карточка 28px, шаг 28px и т.д.;
// цвета — токены приложения, поэтому тёмная тема приходит сама.

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase leading-[1.3] tracking-[0.2em] text-muted">
      {children}
    </span>
  );
}

export function StepTitle({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink sm:text-[30px]">
        {title}
      </h1>
      {sub ? <p className="max-w-[560px] text-ink-soft">{sub}</p> : null}
    </div>
  );
}

export function WizardCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-[24px] border border-line bg-surface p-5 shadow-card sm:rounded-card sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({ title, sub, aside }: { title: string; sub?: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-xl font-semibold leading-[1.25] tracking-[-0.01em] text-ink">{title}</h2>
        {sub ? <p className="text-xs text-muted">{sub}</p> : null}
      </div>
      {aside}
    </div>
  );
}

export function Chip({
  on = false,
  onClick,
  children,
  className,
  disabled,
}: {
  on?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition duration-300 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40",
        on
          ? "border-[var(--color-accent-deep)] bg-accent-soft text-accent-deep"
          : "border-line bg-surface text-ink hover:bg-[var(--color-accent-soft)]",
        className,
      )}
    >
      {children}
      {on ? <Check aria-hidden="true" size={14} strokeWidth={2} /> : null}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "sage" | "ok" | "warn" | "err";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-line bg-panel text-ink-soft",
    sage: "border-accent bg-accent-soft text-accent-deep",
    ok: "border-transparent bg-[var(--color-success-soft)] text-[var(--color-success)]",
    warn: "border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
    err: "border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function pluralGenerations(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "генерация";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "генерации";
  return "генераций";
}

export function GenerationsCounter({
  left,
  label,
}: {
  left: number;
  // По умолчанию — «Осталось N генерации»; можно задать свою подпись.
  label?: string;
}) {
  const total = brandThemeFreeGenerationsPerMonth;
  const empty = left <= 0;
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-2.5 whitespace-nowrap rounded-full border py-1 pl-3 pr-3.5 text-[13px] font-medium",
        empty ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "border-line bg-surface text-ink-soft",
      )}
    >
      <span aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <i
            key={index}
            className={cn(
              "inline-block h-2 w-2 rounded-full border-[1.5px]",
              empty ? "border-[var(--color-danger)]" : "border-[var(--color-accent-deep)]",
            )}
            style={index < left ? { backgroundColor: "var(--color-accent-deep)" } : undefined}
          />
        ))}
      </span>
      {label ?? `Осталось ${left} ${pluralGenerations(left)}`}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  // Цвета — инлайном: самописные .border-accent в globals.css лежат вне
  // слоёв Tailwind и перебили бы border-t-*.
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-[22px] w-[22px] shrink-0 animate-spin rounded-full border-[2.5px] motion-reduce:animate-none",
        className,
      )}
      style={{ borderColor: "var(--color-accent)", borderTopColor: "var(--color-accent-deep)" }}
    />
  );
}

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border transition",
        on ? "border-[var(--color-accent-deep)] bg-accent" : "border-line bg-panel",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-5 w-5 rounded-full border bg-surface transition-all duration-300",
          on ? "left-[23px] border-[var(--color-accent-deep)]" : "left-[3px] border-line",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex gap-0.5 rounded-full border border-line bg-panel p-1", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-[18px] text-sm font-medium transition",
            value === option.value
              ? "border-line bg-surface text-ink shadow-subtle"
              : "border-transparent text-ink-soft hover:text-[var(--color-ink)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Окно на десктопе, шит снизу на телефоне (макеты 4.11, 4.13, 4.14). */
export function WizardDialog({
  open,
  onClose,
  labelledBy,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-6"
      style={{ backgroundColor: "rgba(35,36,31,0.46)", backdropFilter: "blur(6px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "flex max-h-[92dvh] w-full flex-col gap-[22px] overflow-auto rounded-t-[32px] border border-line bg-surface px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-6 shadow-ink sm:max-h-[calc(100dvh-64px)] sm:rounded-[32px] sm:p-8",
          wide ? "sm:max-w-[760px]" : "sm:max-w-[600px]",
        )}
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
      >
        <span aria-hidden="true" className="mx-auto -mt-2.5 block h-[5px] w-11 rounded-full bg-[var(--color-line)] sm:hidden" />
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export function DialogClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Закрыть"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
    >
      <X size={18} />
    </button>
  );
}

/** Зона перетаскивания (4.3 «Перетащите файлы сюда», 4.4 «Добавить фото»). */
export function DropZone({
  accept,
  multiple = true,
  onFiles,
  title,
  hint,
  compact = false,
  error,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: string;
  hint?: string;
  compact?: boolean;
  error?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-[28px] border-[1.5px] border-dashed text-center transition",
        compact ? "px-4 py-6" : "px-6 py-9",
        over
          ? "border-[var(--color-accent-deep)] bg-accent-soft"
          : error
            ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]"
            : "border-line bg-surface",
      )}
    >
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-accent bg-accent-soft text-accent-deep">
        <Upload aria-hidden="true" size={20} strokeWidth={1.6} />
      </span>
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="text-[13px] text-muted">
        или{" "}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-medium text-ink underline underline-offset-4"
        >
          выберите на устройстве
        </button>
      </p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}

export type FileRowState =
  | { status: "uploading"; progress: number }
  | { status: "uploaded"; note?: string }
  | { status: "error"; message: string }
  | { status: "rejected"; message: string };

/** Строка файла (4.3): миниатюра, имя, размер, прогресс или итог, «убрать». */
export function FileRow({
  name,
  size,
  isPdf,
  state,
  onRemove,
  action,
}: {
  name: string;
  size: string;
  isPdf: boolean;
  state: FileRowState;
  onRemove: () => void;
  action?: React.ReactNode;
}) {
  const bad = state.status === "error" || state.status === "rejected";
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-[20px] border px-3.5 py-3",
        bad ? "border-[var(--color-danger-border)] bg-[var(--color-danger-soft)]" : "border-line bg-surface",
      )}
    >
      <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border border-line bg-panel text-muted">
        {isPdf ? <FileText aria-hidden="true" size={20} /> : <ImageIcon aria-hidden="true" size={20} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-ink">{name}</span>
          <span className="shrink-0 text-xs text-muted">
            {size}
            {state.status === "uploading" ? ` · ${Math.round(state.progress)}%` : ""}
          </span>
        </div>
        {state.status === "uploading" ? (
          <span className="h-1.5 overflow-hidden rounded-full border border-line bg-panel">
            <i
              className="block h-full rounded-full transition-[width]"
              style={{ width: `${state.progress}%`, backgroundColor: "var(--color-accent-deep)" }}
            />
          </span>
        ) : (
          <span className={cn("text-xs", bad ? "text-[var(--color-danger)]" : "text-[var(--color-success)]")}>
            {state.status === "uploaded" ? (state.note ?? "Загружен") : state.message}
          </span>
        )}
      </div>
      {action}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Убрать ${name}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} МБ`;
  return `${Math.max(1, Math.round(bytes / 1000))} КБ`;
}
