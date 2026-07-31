import { cn } from "@/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export function Textarea({ label, hint, className, ...props }: TextareaProps) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <textarea
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--ui-field-bg)",
          color: "var(--color-ink)",
        }}
        className={cn(
          "min-h-28 rounded-nested border px-4 py-3 text-sm outline-none transition",
          className,
        )}
        data-ui-textarea
        {...props}
      />
      {hint ? (
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
