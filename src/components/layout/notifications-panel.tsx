"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Bell, Megaphone, Sparkles, X } from "lucide-react";
import type { AccountNotificationItem } from "@/lib/account-notifications";
import { Badge } from "@/components/ui/badge";
import { ClientPortal } from "@/components/ui/client-portal";
import { cn } from "@/lib/utils";

const NOTIFICATIONS_CHANGE_EVENT = "okno-notifications-change";

export function NotificationsPanel({
  items,
  storageKey,
}: {
  items: AccountNotificationItem[];
  storageKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const lastSeenAt = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => undefined;
      }

      const onStorage = (event: StorageEvent) => {
        if (!event.key || event.key === storageKey) {
          onStoreChange();
        }
      };
      const onLocalChange = () => onStoreChange();

      window.addEventListener("storage", onStorage);
      window.addEventListener(NOTIFICATIONS_CHANGE_EVENT, onLocalChange);

      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(NOTIFICATIONS_CHANGE_EVENT, onLocalChange);
      };
    },
    () => {
      if (typeof window === "undefined") {
        return null;
      }

      return window.localStorage.getItem(storageKey);
    },
    () => null,
  );

  const latestCreatedAt = items[0]?.createdAt ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const unreadCount = useMemo(() => {
    if (!lastSeenAt) {
      return items.length;
    }

    return items.filter((item) => item.createdAt > lastSeenAt).length;
  }, [items, lastSeenAt]);

  const toggleOpen = () => {
    const nextOpen = !open;

    if (nextOpen && latestCreatedAt) {
      window.localStorage.setItem(storageKey, latestCreatedAt);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGE_EVENT));
    }

    setOpen(nextOpen);
  };

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Закрыть уведомления" : "Открыть уведомления"}
        onClick={toggleOpen}
        className={cn(
          "relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-panel active:scale-95",
          open && "border-ink-soft bg-surface text-ink",
        )}
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-ink-contrast">
            {Math.min(unreadCount, 9)}
          </span>
        ) : null}
      </button>

      {open ? (
        <ClientPortal>
          <button
            type="button"
            aria-label="Закрыть уведомления"
            className="fixed inset-0 z-40 bg-[rgba(26,26,23,0.08)]"
            onClick={() => setOpen(false)}
          />

          <div className="fixed right-4 top-20 z-50 flex max-h-[min(78vh,640px)] w-[min(calc(100vw-2rem),380px)] flex-col rounded-[28px] border border-line bg-surface p-4 shadow-[0_30px_80px_rgba(35,36,31,0.16)] transition duration-300">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted">
                  Уведомления
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  Новые записи и системные подсказки по кабинету.
                </p>
              </div>
              <button
                type="button"
                aria-label="Закрыть уведомления"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:bg-panel"
              >
                <X size={16} />
              </button>
            </div>

            <div
              className="mt-4 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {items.length > 0 ? (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      router.push(item.href);
                      setOpen(false);
                    }}
                    className="block w-full rounded-[22px] border border-line bg-panel p-4 text-left transition hover:bg-surface"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                          {item.tone === "warning" ? (
                            <Megaphone size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-ink-soft">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <Badge tone={item.tone}>{item.createdAtLabel}</Badge>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-line p-4 text-sm text-muted">
                  Пока новых уведомлений нет.
                </div>
              )}
            </div>
          </div>
        </ClientPortal>
      ) : null}
    </>
  );
}
