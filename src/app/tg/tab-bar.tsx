"use client";

import { CalendarHeart, Home, Search, UserRound } from "lucide-react";
import type { TabId } from "@/app/tg/types";
import { cn } from "@/lib/utils";

const tabs: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "search", label: "Поиск", icon: Search },
  { id: "visits", label: "Визиты", icon: CalendarHeart },
  { id: "profile", label: "Профиль", icon: UserRound },
];

// Нижняя панель вкладок. Отступ снизу — больший из двух: env() даёт вырез
// экрана в обычном вебвью, а переменная Telegram — в полноэкранном режиме
// мини-аппа, где env() равен нулю.
export function TabBar({
  active,
  onChange,
  badges,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  badges: Partial<Record<TabId, number>>;
}) {
  return (
    <nav
      aria-label="Разделы приложения"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface"
      style={{
        paddingBottom:
          "max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px))",
      }}
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          const badge = badges[tab.id] ?? 0;

          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 transition-colors duration-200 active:scale-[0.96]",
                  isActive ? "text-ink" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-200",
                    isActive ? "bg-accent-soft text-accent-deep" : "bg-transparent",
                  )}
                >
                  <tab.icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                  {badge > 0 ? (
                    <span className="absolute right-1.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold leading-none text-ink-contrast">
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-medium leading-none">{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
