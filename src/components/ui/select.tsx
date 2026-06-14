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
      <span className="font-medium" style={{ color: "var(--color-ink, #23241f)" }}>
        {label}
      </span>
      <select
        style={{
          borderColor: "var(--color-line, #d3c5b3)",
          backgroundColor: "var(--ui-field-bg, #ffffff)",
          color: "var(--color-ink, #23241f)",
        }}
        className="min-h-12 rounded-2xl border px-4 text-[15px] outline-none transition"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span className="text-xs" style={{ color: "var(--color-muted, #656055)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
