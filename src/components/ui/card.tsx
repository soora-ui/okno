import { cn } from "@/lib/utils";

export function Card({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--ui-card-bg, #ffffff)",
        ...style,
      }}
      className={cn(
        "rounded-[28px] border border-line bg-surface p-6 shadow-[0_24px_80px_rgba(28,31,27,0.08)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
