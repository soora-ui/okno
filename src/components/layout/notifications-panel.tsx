"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { Bell, Megaphone, Sparkles, X } from "lucide-react";
import type { AccountNotificationItem } from "@/lib/account-notifications";
import { Badge } from "@/components/ui/badge";
import { ClientPortal } from "@/components/ui/client-portal";
import { usePresence } from "@/components/ui/use-presence";
import { cn } from "@/lib/utils";

const NOTIFICATIONS_CHANGE_EVENT = "okno-notifications-change";
// Сколько скрытых ключей держим в localStorage. Сервер отдаёт не больше 20
// уведомлений, так что запас с большим избытком.
const DISMISSED_LIMIT = 200;
const VISIBLE_LIMIT = 8;
// Свайп короче порога — возврат на место; длиннее — карточка улетает.
const SWIPE_DISMISS_PX = 96;
const SWIPE_TAP_TOLERANCE_PX = 8;

// Системные подсказки («подключи Telegram», «тариф заканчивается») живут с
// createdAt = начало дня, поэтому скрытая сегодня подсказка завтра вернётся,
// а событие с фиксированным временем скрывается навсегда.
function dismissKey(item: AccountNotificationItem) {
  return `${item.id}@${item.createdAt}`;
}

function parseDismissed(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function useLocalStorageValue(storageKey: string) {
  return useSyncExternalStore(
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
}

export function NotificationsPanel({
  items,
  storageKey,
  dismissedStorageKey,
}: {
  items: AccountNotificationItem[];
  storageKey: string;
  dismissedStorageKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const presence = usePresence(open, 240);
  const lastSeenAt = useLocalStorageValue(storageKey);
  const dismissedRaw = useLocalStorageValue(dismissedStorageKey);

  const visibleItems = useMemo(() => {
    const dismissed = new Set(parseDismissed(dismissedRaw));
    return items.filter((item) => !dismissed.has(dismissKey(item)));
  }, [items, dismissedRaw]);

  const latestCreatedAt = visibleItems[0]?.createdAt ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const unreadCount = useMemo(() => {
    if (!lastSeenAt) {
      return visibleItems.length;
    }

    return visibleItems.filter((item) => item.createdAt > lastSeenAt).length;
  }, [visibleItems, lastSeenAt]);

  const toggleOpen = () => {
    const nextOpen = !open;

    if (nextOpen && latestCreatedAt) {
      window.localStorage.setItem(storageKey, latestCreatedAt);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGE_EVENT));
    }

    setOpen(nextOpen);
  };

  const dismiss = (item: AccountNotificationItem) => {
    const current = parseDismissed(
      window.localStorage.getItem(dismissedStorageKey),
    );
    const next = [...current.filter((key) => key !== dismissKey(item)), dismissKey(item)]
      .slice(-DISMISSED_LIMIT);

    window.localStorage.setItem(dismissedStorageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGE_EVENT));
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

      {presence.mounted ? (
        <ClientPortal>
          <button
            type="button"
            aria-label="Закрыть уведомления"
            data-state={presence.state}
            className="morph-scrim fixed inset-0 z-40 bg-[rgba(26,26,23,0.08)]"
            onClick={() => setOpen(false)}
          />

          {/* Скролл страницы не блокируем: body overflow:hidden убирает
              скроллбар, и на Windows весь интерфейс прыгает на его ширину
              при каждом открытии/закрытии. Список внутри скроллится сам,
              overscroll-contain не даёт прокрутке уйти на страницу. */}
          <div
            data-state={presence.state}
            className="morph-panel morph-glass fixed right-4 top-20 z-50 flex max-h-[min(78vh,640px)] w-[min(calc(100vw-2rem),380px)] flex-col rounded-card border border-line p-4 shadow-hover"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">
                Уведомления
              </p>
              <button
                type="button"
                aria-label="Закрыть уведомления"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:bg-panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Отрицательные поля + такие же паддинги: крестик карточки
                выступает за её угол, и без запаса overflow его бы обрезал. */}
            <div
              className="-mx-2 mt-2 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-2 pt-2"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {visibleItems.length > 0 ? (
                visibleItems.slice(0, VISIBLE_LIMIT).map((item) => (
                  <NotificationCard
                    key={item.id}
                    item={item}
                    onOpen={() => {
                      router.push(item.href);
                      setOpen(false);
                    }}
                    onDismiss={() => dismiss(item)}
                  />
                ))
              ) : (
                <div className="rounded-panel border border-dashed border-line p-4 text-sm text-muted">
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

function NotificationCard({
  item,
  onOpen,
  onDismiss,
}: {
  item: AccountNotificationItem;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [phase, setPhase] = useState<"idle" | "dragging" | "leaving">("idle");
  const startXRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const leaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  const leave = (direction: 1 | -1) => {
    setPhase("leaving");
    setOffsetX(direction * 480);
    leaveTimerRef.current = window.setTimeout(onDismiss, 220);
  };

  // Свайп только пальцем/стилусом: мышь на десктопе закрывает крестиком, а
  // перетаскивание кнопки мышью выглядело бы как баг.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || phase === "leaving") {
      return;
    }

    startXRef.current = event.clientX;
    movedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPhase("dragging");
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null || phase !== "dragging") {
      return;
    }

    const dx = event.clientX - startXRef.current;
    if (Math.abs(dx) > SWIPE_TAP_TOLERANCE_PX) {
      movedRef.current = true;
    }
    setOffsetX(dx);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null || phase !== "dragging") {
      return;
    }

    const dx = event.clientX - startXRef.current;
    startXRef.current = null;

    if (event.type !== "pointercancel" && Math.abs(dx) >= SWIPE_DISMISS_PX) {
      leave(dx > 0 ? 1 : -1);
      return;
    }

    setPhase("idle");
    setOffsetX(0);
  };

  const distance = Math.min(Math.abs(offsetX) / SWIPE_DISMISS_PX, 1);

  return (
    <div
      className="group relative"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <button
        type="button"
        onClick={() => {
          // Клик прилетает после свайпа — не открываем раздел, если палец
          // сдвинул карточку.
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          onOpen();
        }}
        style={{
          transform: `translateX(${offsetX}px)`,
          opacity: phase === "leaving" ? 0 : 1 - distance * 0.5,
          transition:
            phase === "dragging"
              ? "none"
              : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
        }}
        className="block w-full rounded-panel border border-line bg-panel p-4 text-left transition-colors hover:bg-surface"
      >
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
            {item.tone === "warning" ? (
              <Megaphone size={16} />
            ) : (
              <Sparkles size={16} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-ink">{item.title}</p>
              {/* Дата — метка времени, а не статус, поэтому подложка одна
                  на всех, а не по tone события (раньше у одних была зелёная,
                  у других нет). Стоит рядом с заголовком, чтобы не сжимать
                  описание. */}
              <span className="shrink-0 whitespace-nowrap">
                <Badge tone="success">{item.createdAtLabel}</Badge>
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              {item.description}
            </p>
          </div>
        </div>
      </button>

      {/* На тач-устройствах ховера нет — там карточку смахивают свайпом. */}
      <button
        type="button"
        aria-label="Скрыть уведомление"
        onClick={(event) => {
          event.stopPropagation();
          leave(1);
        }}
        className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-soft opacity-0 shadow-sm transition hover:bg-panel hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
