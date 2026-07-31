"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Показывать ли блок появления.
 *
 * Раньше здесь был чистый `whileInView` с `once: true`. При быстрой прокрутке
 * (рывок колесом, перетаскивание скроллбара, восстановление позиции) браузер
 * не успевал отдать колбэк IntersectionObserver, а `once` не давал второго
 * шанса — секция оставалась `opacity: 0` навсегда, до перезагрузки. На лендинге
 * так терялось до 20 блоков разом.
 *
 * Поэтому наблюдатель тут не единственный источник правды: параллельно, по
 * событию скролла, проверяется фактическая геометрия. Как только элемент
 * оказался в вьюпорте или выше него — показываем и снимаем слушатели, так что
 * после проявления всех блоков на странице не остаётся ни одного обработчика.
 */
export function useRevealed(
  ref: RefObject<HTMLElement | null>,
  offset = 80,
): boolean {
  const [revealed, setRevealed] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    if (revealed) return;

    const el = ref.current;
    if (!el) return;

    const show = () => setRevealed(true);

    // Элемент уже виден или прокручен выше — показываем без анимации ожидания.
    const check = () => {
      frame.current = 0;
      const node = ref.current;
      if (!node) return;
      if (node.getBoundingClientRect().top < window.innerHeight - offset) show();
    };

    // Скролл может сыпаться десятками событий в кадр — сводим к одному rAF.
    const onScroll = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(check);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) show();
      },
      { rootMargin: `0px 0px -${offset}px 0px` },
    );
    observer.observe(el);

    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [ref, offset, revealed]);

  return revealed;
}
