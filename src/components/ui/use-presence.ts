"use client";

import { useEffect, useState } from "react";

export type PresenceState = "open" | "closed";

// Держит элемент в DOM на время анимации закрытия и даёт ему один кадр в
// закрытом состоянии перед открытием — иначе CSS-переходу не от чего
// стартовать. Возвращает флаг монтирования и состояние для data-state.
export function usePresence(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  // Подстройка состояния прямо в рендере, а не в эффекте: открытие должно
  // смонтировать элемент в том же проходе, закрытие — сразу переключить
  // data-state, чтобы переход закрытия начался без лишнего кадра.
  if (open && !mounted) {
    setMounted(true);
  }
  if (!open && shown) {
    setShown(false);
  }

  useEffect(() => {
    if (open) {
      // Заставляем браузер посчитать стили свежего элемента в закрытом
      // состоянии — от них и пойдёт переход. Не через requestAnimationFrame:
      // в фоновой вкладке он троттлится, и панель открывалась бы с задержкой.
      void document.body.offsetHeight;
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setShown(true);
        }
      });

      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => setMounted(false), exitMs);

    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return {
    mounted,
    state: (open && shown ? "open" : "closed") as PresenceState,
  };
}
