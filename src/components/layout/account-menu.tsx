"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, CalendarDays, Globe, LayoutDashboard, LogOut, Menu, Settings, Users, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { ClientPortal } from "@/components/ui/client-portal";
import { cn } from "@/lib/utils";

type AccountMenuProps = {
  username?: string;
  authenticated: boolean;
  showTeamLink?: boolean;
};

const guestLinks = [
  { href: "/", label: "Главная" },
  { href: "/pricing", label: "Тарифы" },
  { href: "/login", label: "Войти" },
  { href: "/register", label: "Начать бесплатно" },
];

export function AccountMenu({
  username,
  authenticated,
  showTeamLink = false,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const authLinks = [
    ...(showTeamLink
      ? [{ href: "/team", label: "Команда", icon: Users }]
      : []),
    {
      href: "/dashboard",
      label: showTeamLink ? "Мой кабинет" : "Сегодня",
      icon: LayoutDashboard,
    },
    { href: "/archive", label: "Архив", icon: Archive },
    { href: "/schedule", label: "Расписание", icon: CalendarDays },
    { href: "/clients", label: "Клиенты", icon: Users },
    { href: "/settings", label: "Настройки", icon: Settings },
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-panel active:scale-95",
          open && "border-ink-soft bg-surface text-ink",
        )}
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Menu
            size={18}
            className={cn(
              "absolute transition duration-300",
              open ? "scale-75 opacity-0" : "scale-100 opacity-100",
            )}
          />
          <X
            size={18}
            className={cn(
              "absolute transition duration-300",
              open ? "scale-100 opacity-100" : "scale-75 opacity-0",
            )}
          />
        </span>
      </button>

      {open ? (
        <ClientPortal>
          <button
            type="button"
            aria-label="Закрыть меню"
            className="fixed inset-0 z-40 bg-[rgba(26,26,23,0.1)]"
            onClick={() => setOpen(false)}
          />

          <div className="fixed right-4 top-20 z-50 w-[min(92vw,360px)] rounded-card border border-line bg-surface p-4 shadow-hover transition duration-300">
            {authenticated ? (
              <div className="space-y-2">
                <div className="rounded-panel bg-panel p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted">
                    Навигация
                  </p>
                  <div className="mt-3 space-y-2">
                    {authLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-panel px-3 py-3 text-sm font-medium text-ink transition hover:bg-surface"
                      >
                        <item.icon size={16} />
                        {item.label}
                      </Link>
                    ))}
                    {username ? (
                      <Link
                        href={`/${username}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-panel px-3 py-3 text-sm font-medium text-ink transition hover:bg-surface"
                      >
                        <Globe size={16} />
                        Публичная страница
                      </Link>
                    ) : null}
                  </div>
                </div>

                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-panel border border-line bg-surface px-4 py-3 text-sm font-medium text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-panel active:scale-[0.99]"
                  >
                    <span>Выйти из аккаунта</span>
                    <LogOut size={16} />
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-2">
                {guestLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-panel px-4 py-3 text-sm font-medium text-ink transition hover:bg-panel"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </ClientPortal>
      ) : null}
    </>
  );
}
