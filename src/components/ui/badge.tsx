import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "accent" | "warning" | "danger";
}) {
  const tones = {
    neutral: {
      backgroundColor: "var(--color-panel)",
      color: "var(--color-ink-soft)",
    },
    success: {
      backgroundColor: "var(--color-success-soft)",
      color: "var(--color-success)",
    },
    accent: {
      backgroundColor: "var(--color-accent-soft)",
      color: "var(--color-accent-deep)",
    },
    warning: {
      backgroundColor: "var(--color-warning-soft)",
      color: "var(--color-warning)",
    },
    danger: {
      backgroundColor: "var(--color-danger-soft)",
      color: "var(--color-danger)",
    },
  };

  return (
    <span
      style={tones[tone]}
      className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-medium")}
    >
      {children}
    </span>
  );
}
