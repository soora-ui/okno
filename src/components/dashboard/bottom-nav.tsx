"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Только четыре основных раздела: панель на пять и больше вкладок превращается
// в тот же бургер, просто разложенный горизонтально. Архив, Команда и выход
// живут внутри соответствующих разделов.
const items = [
  { href: "/dashboard", label: "Сегодня", icon: LayoutDashboard },
  { href: "/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/clients", label: "Клиенты", icon: Users },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function CabinetBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы кабинета"
      className="fixed inset-x-0 bottom-[var(--browser-toolbar-overlap)] z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <item.icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                <span className="text-[11px] leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
