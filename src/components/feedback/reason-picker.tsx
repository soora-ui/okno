"use client";

import type { FeedbackReason } from "@/lib/feedback/config";
import { cn } from "@/lib/utils";

// Причины кнопками-чипсами, а не выпадающим списком: на телефоне их видно
// сразу все, и ответ — одно касание. Сами значения уходят в форму через
// скрытое поле name="reason".
export function ReasonPicker({
  reasons,
  value,
  onChange,
  name = "reason",
}: {
  reasons: readonly FeedbackReason[];
  value: string | null;
  onChange: (code: string) => void;
  name?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      <input type="hidden" name={name} value={value ?? ""} />
      {reasons.map((reason) => {
        const selected = value === reason.code;

        return (
          <button
            key={reason.code}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(reason.code)}
            className={cn(
              "min-h-10 rounded-full border px-4 py-2 text-sm transition active:scale-[0.98]",
              selected
                ? "border-ink bg-ink text-white"
                : "border-line text-ink hover:bg-panel",
            )}
            style={selected ? { backgroundColor: "var(--color-ink)" } : undefined}
          >
            {reason.label}
          </button>
        );
      })}
    </div>
  );
}

export function FollowUpField({
  placeholder,
  name = "message",
}: {
  placeholder: string;
  name?: string;
}) {
  return (
    <textarea
      name={name}
      rows={3}
      maxLength={2000}
      placeholder={placeholder}
      className="w-full rounded-nested border border-line px-4 py-3 text-sm text-ink outline-none transition"
      style={{ backgroundColor: "var(--ui-field-bg)" }}
    />
  );
}
