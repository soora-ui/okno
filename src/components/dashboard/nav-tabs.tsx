import Link from "next/link";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Сегодня" },
  { href: "/schedule", label: "Расписание" },
  { href: "/clients", label: "Клиенты" },
  { href: "/settings", label: "Настройки" },
];

export function DashboardTabs({ current }: { current: string }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-surface p-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-full px-4 py-2 text-sm transition",
            current === item.href
              ? "bg-ink text-ink-contrast"
              : "text-ink-soft hover:bg-panel",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
