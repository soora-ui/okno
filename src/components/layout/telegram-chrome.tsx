"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getWebApp, syncTelegramChrome } from "@/app/tg/telegram";

// Оболочка Telegram для страниц вне /tg.
//
// Из мини-аппа человек уходит обычной навигацией в том же вебвью: клиент — на
// страницу мастера и запись, мастер — в кабинет. У вебвью Telegram на iOS нет
// кнопки «назад», и без этого компонента выйти оттуда можно только закрыв
// приложение. Здесь подключается SDK, шапка Telegram красится в фон страницы
// и включается родная кнопка «Назад».
//
// Вне Telegram компонент не делает ничего: SDK не грузится, разметка не
// меняется.

const sdkUrl = "https://telegram.org/js/telegram-web-app.js";
// Корни кабинета: первый экран мастера после запуска приложения.
const cabinetRoots = new Set(["/dashboard", "/team"]);

// SDK при первом запуске сохраняет параметры запуска в sessionStorage — по
// ним и узнаём, что вкладка живёт внутри Telegram, уже после ухода с /tg.
function isInsideTelegram() {
  try {
    return (
      window.location.hash.includes("tgWebAppData=") ||
      Boolean(window.sessionStorage.getItem("__telegram__initParams"))
    );
  } catch {
    return false;
  }
}

function loadSdk(): Promise<void> {
  if (getWebApp()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = sdkUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("telegram sdk"));
    document.head.appendChild(script);
  });
}

export function TelegramChrome() {
  const pathname = usePathname();
  const router = useRouter();

  // Синхронизация с внешней системой — клиентом Telegram: его шапкой и
  // кнопкой «Назад». На /tg этим занимается само приложение.
  useEffect(() => {
    if (pathname === "/tg" || !isInsideTelegram()) {
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void loadSdk()
      .then(() => {
        const webApp = getWebApp();

        if (cancelled || !webApp?.initData) {
          return;
        }

        // Метка для стилей: внутри Telegram прячем то, что там не имеет
        // смысла, — например, предложение установить PWA.
        document.documentElement.dataset.telegram = "true";
        webApp.ready();
        webApp.expand();
        syncTelegramChrome();

        const backButton = webApp.BackButton;
        if (!backButton) {
          return;
        }

        // На корне кабинета возвращаться некуда: мастер попал сюда прямо из
        // запуска приложения, и Telegram сам показывает там «Закрыть».
        if (cabinetRoots.has(pathname)) {
          backButton.hide();
          return;
        }

        const goBack = () => {
          if (window.history.length <= 1) {
            router.push("/tg");
            return;
          }

          window.history.back();
        };

        backButton.onClick(goBack);
        backButton.show();
        cleanup = () => backButton.offClick(goBack);
      })
      .catch(() => {
        // SDK не загрузился — страница остаётся обычной веб-страницей.
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [pathname, router]);

  return null;
}
