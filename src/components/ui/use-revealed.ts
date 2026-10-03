"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Ниже этой ширины вьюпорт считается мобильным (совпадает с `md:` в Tailwind).
 * На телефоне экран короче, и с десктопным отступом блок не успевает доехать
 * до триггера — стоит у нижнего края невидимым, пока не дотянешь ещё.
 */
const MOBILE_BREAKPOINT = 768;
const MOBILE_OFFSET = 40;

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
 *
 * `offset` — отступ триггера от нижнего края на десктопе. На мобильных он
 * заменяется на `MOBILE_OFFSET` (ТЗ, п. 6). Ширина читается только внутри
 * эффекта: на сервере `window` нет, а первый рендер и так одинаковый —
 * `revealed` стартует с `false` на обеих сторонах.
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
    const resolveOffset = () =>
      window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_OFFSET : offset;

    // Элемент уже виден или прокручен выше — показываем без анимации ожидания.
    // Отступ считаем на каждый вызов: `check` дёргается и на resize, так что
    // поворот телефона или сужение окна подхватываются без пересоздания эффекта.
    const check = () => {
      frame.current = 0;
      const node = ref.current;
      if (!node) return;
      if (node.getBoundingClientRect().top < window.innerHeight - resolveOffset()) {
        show();
      }
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
      { rootMargin: `0px 0px -${resolveOffset()}px 0px` },
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
