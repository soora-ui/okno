"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Событие Chrome/Android, которого нет в стандартных типах DOM.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "okno.install-prompt.dismissed-at";
// Закрытую подсказку не показываем месяц: чаще — навязчиво, никогда — мастер
// так и не узнает, что кабинет ставится как приложение.
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

type Mode = "native" | "ios";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari на iOS не поддерживает display-mode в старых версиях.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Добавить на экран «Домой» на iOS можно только из Safari: в Chrome и
// встроенных браузерах (Telegram, Instagram) пункта в меню «Поделиться» нет.
function isIosSafari() {
  const ua = navigator.userAgent;
  const isIos =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser|Telegram|Instagram/.test(ua);
}

function wasRecentlyDismissed() {
  try {
    const value = Number(window.localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(value) && Date.now() - value < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

// Подсказка «Установите кабинет на телефон». На Android вызывает системный
// диалог установки, на iOS объясняет два шага через «Поделиться» — другого
// способа Safari не даёт. Только для мобильной вёрстки и только в браузере:
// в установленном приложении она не нужна.
// Условия для iOS не меняются, пока открыта страница, поэтому подписываться
// не на что: useSyncExternalStore тут только для того, чтобы на сервере и при
// гидрации было false, а на клиенте — настоящее значение.
const subscribeNever = () => () => {};

export function InstallAppPrompt() {
  const iosEligible = useSyncExternalStore(
    subscribeNever,
    () => !isStandalone() && !wasRecentlyDismissed() && isIosSafari(),
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: Mode | null = dismissed
    ? null
    : iosEligible
      ? "ios"
      : installEvent
        ? "native"
        : null;

  if (!mode) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Приватный режим: подсказка просто вернётся при следующем заходе.
    }
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === "dismissed") dismiss();
  };

  return (
    <aside
      aria-label="Установка приложения"
      data-install-prompt=""
      className="relative mb-4 flex items-start gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4 md:hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- статичная иконка 192px, оптимизация не нужна */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={44}
        height={44}
        className="size-11 shrink-0 rounded-[var(--radius-tight)] border border-line"
      />
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-sm font-semibold text-ink">Кабинет okno на телефоне</p>
        {mode === "native" ? (
          <>
            <p className="mt-1 text-sm text-muted">
              Открывается с экрана «Домой» в один тап, без адресной строки.
            </p>
            <Button className="mt-3 min-h-10 px-4 py-2" onClick={install}>
              Установить
            </Button>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Нажмите{" "}
            <Share aria-label="Поделиться" size={16} className="inline align-[-3px]" />{" "}
            внизу Safari, затем{" "}
            <span className="whitespace-nowrap">
              <SquarePlus aria-hidden size={16} className="inline align-[-3px]" /> «На экран
              „Домой“»
            </span>
            .
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Скрыть подсказку"
        className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full text-muted transition hover:text-ink"
      >
        <X size={18} />
      </button>
    </aside>
  );
}
