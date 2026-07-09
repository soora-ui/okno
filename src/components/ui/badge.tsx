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
      backgroundColor: "var(--color-panel, #eee7dc)",
      color: "var(--color-ink-soft, #434239)",
    },
    success: {
      backgroundColor: "var(--color-success-soft, #e6f3eb)",
      color: "var(--color-success, #3f7b5a)",
    },
    accent: {
      backgroundColor: "var(--color-accent-soft, #eef6f0)",
      color: "var(--color-accent-deep, #4b6d5b)",
    },
    warning: {
      backgroundColor: "var(--color-warning-soft, #f5ecdb)",
      color: "var(--color-warning, #8e6c2f)",
    },
    danger: {
      backgroundColor: "var(--color-danger-soft, #fff5f5)",
      color: "var(--color-danger, #b14f4f)",
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
