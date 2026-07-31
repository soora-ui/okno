type SelectOption = {
  label: string;
  value: string;
};

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  options: SelectOption[];
};

export function Select({ label, hint, options, ...props }: SelectProps) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <select
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--ui-field-bg)",
          color: "var(--color-ink)",
        }}
        className="min-h-12 rounded-field border px-4 text-sm outline-none transition"
        data-ui-select
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
