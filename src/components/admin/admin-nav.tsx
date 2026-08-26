"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/support", label: "Поддержка" },
  { href: "/admin/logs", label: "Логи" },
  { href: "/admin/errors", label: "Ошибки" },
];

export function AdminNav({ unresolvedErrors }: { unresolvedErrors: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              backgroundColor: active
                ? "var(--color-ink)"
                : "var(--ui-card-bg)",
              color: active ? "#ffffff" : "var(--color-ink)",
              borderColor: "var(--color-line)",
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
            )}
          >
            {link.label}
            {link.href === "/admin/errors" && unresolvedErrors > 0 ? (
              <span
                style={{
                  backgroundColor: "var(--color-warning)",
                  color: "#ffffff",
                }}
                className="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold"
              >
                {unresolvedErrors}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
