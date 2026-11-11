import { useId } from "react";
import { cn } from "@/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  // Ошибка поля: красная рамка и текст вместо подсказки.
  error?: string;
};

export function Textarea({ label, hint, error, className, id, ...props }: TextareaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const noteId = `${textareaId}-note`;
  const note = error || hint;

  return (
    <label className="flex flex-col gap-2 text-sm" data-field-invalid={error ? true : undefined}>
      <span className="font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <textarea
        id={textareaId}
        style={{
          borderColor: error ? "var(--color-danger)" : "var(--color-line)",
          backgroundColor: error ? "var(--color-danger-soft)" : "var(--ui-field-bg)",
          color: "var(--color-ink)",
        }}
        className={cn(
          "min-h-28 rounded-nested border px-4 py-3 text-sm outline-none transition",
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        data-ui-textarea
        {...props}
      />
      {note ? (
        <span
          id={noteId}
          className="text-xs"
          role={error ? "alert" : undefined}
          style={{ color: error ? "var(--color-danger)" : "var(--color-muted)" }}
        >
          {note}
        </span>
      ) : null}
    </label>
  );
}
