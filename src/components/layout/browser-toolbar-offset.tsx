"use client";

import { useEffect } from "react";

// В iOS Safari position:fixed отсчитывается от layout viewport, а он
// соответствует состоянию со свёрнутой нижней панелью браузера. Стоит ей
// развернуться при прокрутке вверх — она ложится поверх всего, что прижато к
// низу. Узнать высоту перекрытия можно только через visualViewport:
// env(safe-area-inset-bottom) здесь бесполезен, он про домашний индикатор.
//
// Слушатель один на всё приложение, а результат кладём в CSS-переменную —
// иначе каждый прижатый к низу элемент считал бы перекрытие сам, и они
// разъезжались бы между собой (кнопка чата уже так наехала на панель вкладок).
export function BrowserToolbarOffset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    const update = () => {
      const overlap = Math.max(
        0,
        root.clientHeight - (viewport.height + viewport.offsetTop),
      );
      root.style.setProperty("--browser-toolbar-overlap", `${overlap}px`);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--browser-toolbar-overlap");
    };
  }, []);

  return null;
}
