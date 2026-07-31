import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function Input({ label, hint, className, ...props }: InputProps) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <input
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--ui-field-bg)",
          color: "var(--color-ink)",
        }}
        className={cn(
          "min-h-12 rounded-field border px-4 text-sm outline-none transition",
          className,
        )}
        data-ui-input
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
