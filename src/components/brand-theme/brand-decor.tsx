import type { BrandDecorStyle } from "@/lib/brand-theme/schema";

// Библиотека декора фирменного стиля: рисунки из макета PublicPage.dc.html,
// по одному на каждый стиль и слот. ИИ выбирает стиль и цвета, но не рисует
// SVG сам, поэтому в разметку страницы не попадает ничего постороннего.
// Цвета — из переменных темы (--brand-decor-1/2), так что один и тот же
// рисунок перекрашивается под любую палитру.
//
// Слоты фиксированы: фон первого экрана, рамка аватара, разделитель секций,
// уголок карточки услуги, подложка кнопки записи. Без фирменного стиля
// (decor = null) все компоненты возвращают null и страница не меняется.

type DecorProps = { decor: BrandDecorStyle | null };

const d1 = "var(--brand-decor-1)";
// Интенсивность декора: фон — как есть, линии и рамки — не ниже 0,4.
const backdropOpacity = { opacity: "calc(var(--brand-decor-opacity, 0.6) * 0.75)" };
const lineOpacity = { opacity: "calc(0.4 + var(--brand-decor-opacity, 0.6) * 0.6)" };
const d2 = "var(--brand-decor-2)";
const leaf = "M0 0C6-9 18-9 24 0C18 9 6 9 0 0Z";

/** Слот 1. Фон первого экрана: лежит под содержимым карточки (родитель — isolate). */
export function BrandHeroDecor({ decor }: DecorProps) {
  if (!decor || decor === "none") return null;

  const className =
    "pointer-events-none absolute inset-0 -z-10 h-full w-full";

  if (decor === "geometric") {
    return (
      <svg aria-hidden="true" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid meet" className={className} style={backdropOpacity}>
        <g fill="none" stroke={d1} strokeWidth="1">
          <path d="M250 40h110v110H250z" />
          <path d="M265 55h80v80h-80z" stroke={d2} />
          <path d="M250 40l110 110M360 40L250 150" opacity=".5" />
          <path d="M190 200L390 0" opacity=".4" />
        </g>
      </svg>
    );
  }

  if (decor === "botanical") {
    return (
      <svg aria-hidden="true" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMax meet" className={className} style={backdropOpacity}>
        <g fill="none" stroke={d2} strokeWidth="1.6" strokeLinecap="round">
          <path d="M300 210C310 160 300 110 332 56" />
          <path d="M356 210C352 168 372 138 396 104" />
          <path d="M250 210C262 176 258 150 280 122" />
        </g>
        <g fill={d1}>
          <path d={leaf} transform="translate(306 140) rotate(-20)" />
          <path d={leaf} transform="translate(312 100) rotate(-70)" />
          <path d={leaf} transform="translate(330 62) rotate(-40)" />
          <path d={leaf} transform="translate(352 150) rotate(-10)" />
        </g>
        <g fill={d2}>
          <path d={leaf} transform="translate(364 120) rotate(-60)" />
          <path d={leaf} transform="translate(386 106) rotate(-25)" />
          <path d={leaf} transform="translate(264 162) rotate(-25)" />
          <path d={leaf} transform="translate(278 128) rotate(-65)" />
        </g>
      </svg>
    );
  }

  // Мазки растягиваются без сохранения пропорций, поэтому держим их в
  // полосе сверху: на высокой мобильной карточке они иначе становятся арками.
  return (
    <svg aria-hidden="true" viewBox="0 0 400 200" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 w-full" style={backdropOpacity}>
      <g fill="none" strokeLinecap="round">
        <path d="M-20 160C60 110 130 200 210 140S340 60 430 110" stroke={d1} strokeWidth="34" opacity=".35" vectorEffect="non-scaling-stroke" />
        <path d="M-20 70C80 20 150 100 240 50S350 10 430 40" stroke={d2} strokeWidth="12" opacity=".6" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/** Слот 2. Рамка вокруг аватара: родитель — relative-обёртка аватара. */
export function BrandAvatarRing({ decor }: DecorProps) {
  if (!decor || decor === "none") return null;

  const className = "pointer-events-none absolute -inset-2.5 h-[calc(100%+20px)] w-[calc(100%+20px)]";

  if (decor === "geometric") {
    return (
      <svg aria-hidden="true" viewBox="0 0 100 100" className={className} style={lineOpacity}>
        <path d="M50 2L98 50 50 98 2 50Z" fill="none" stroke={d1} strokeWidth="1.4" />
        <path d="M50 9L91 50 50 91 9 50Z" fill="none" stroke={d2} strokeWidth=".8" />
      </svg>
    );
  }

  if (decor === "botanical") {
    const leaves: [number, number, number][] = [
      [5.8, 66.1, 250],
      [3.7, 41.8, 280],
      [14, 19.8, 310],
      [33.9, 5.8, 340],
      [19.8, 86, 220],
      [41.8, 96.3, 190],
    ];
    return (
      <svg aria-hidden="true" viewBox="0 0 100 100" className={className} style={lineOpacity}>
        <circle cx="50" cy="50" r="47" fill="none" stroke={d1} strokeWidth="1.2" />
        <g fill={d2}>
          {leaves.map(([x, y, r]) => (
            <path key={`${x}-${y}`} d="M0 0C3-5 9-5 12 0C9 5 3 5 0 0Z" transform={`translate(${x} ${y}) rotate(${r})`} />
          ))}
        </g>
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className} style={lineOpacity}>
      <path d="M14 66C4 34 30 6 62 9 92 12 99 48 86 74 72 98 30 98 16 72" fill="none" stroke={d1} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function DividerMark({ decor }: { decor: BrandDecorStyle }) {
  if (decor === "geometric") {
    return (
      <svg aria-hidden="true" viewBox="0 0 44 24" width="44" height="24">
        <path d="M22 3l9 9-9 9-9-9z" fill="none" stroke={d1} strokeWidth="1.4" />
        <path d="M22 8l4 4-4 4-4-4z" fill={d1} />
      </svg>
    );
  }

  if (decor === "botanical") {
    return (
      <svg aria-hidden="true" viewBox="0 0 44 24" width="44" height="24">
        <path d="M22 12C14 3 4 8 3 12c7 6 15 5 19 0z" fill={d1} />
        <path d="M22 12c8-9 18-4 19 0-7 6-15 5-19 0z" fill={d2} />
      </svg>
    );
  }

  if (decor === "brush") {
    return (
      <svg aria-hidden="true" viewBox="0 0 64 24" width="64" height="24">
        <path d="M4 16C14 4 24 22 34 10S54 6 60 12" fill="none" stroke={d1} strokeWidth="6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 12 24" width="12" height="24">
      <circle cx="6" cy="12" r="3" fill="var(--color-accent)" />
    </svg>
  );
}

/**
 * Слот 3. Разделитель над секцией. Висит в отступе над ней (родитель —
 * relative-секция с mt-14/mt-16), поэтому не сдвигает вёрстку.
 */
export function BrandDivider({ decor }: DecorProps) {
  if (!decor) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-11 flex items-center gap-3.5"
      style={lineOpacity}
    >
      <i className="h-px flex-1" style={{ backgroundColor: "var(--color-line)" }} />
      <DividerMark decor={decor} />
      <i className="h-px flex-1" style={{ backgroundColor: "var(--color-line)" }} />
    </div>
  );
}

/** Слот 4. Уголок карточки услуги: в поле отступа, не наезжает на цену. */
export function BrandCardCorner({ decor }: DecorProps) {
  if (!decor || decor === "none") return null;

  const className = "pointer-events-none absolute right-1.5 top-1.5 h-[18px] w-[18px]";

  if (decor === "geometric") {
    return (
      <svg aria-hidden="true" viewBox="0 0 40 40" className={className} style={lineOpacity}>
        <path d="M6 4h30v30" fill="none" stroke={d1} strokeWidth="2.4" />
        <path d="M14 12h14v14" fill="none" stroke={d2} strokeWidth="1.8" />
      </svg>
    );
  }

  if (decor === "botanical") {
    return (
      <svg aria-hidden="true" viewBox="0 0 40 40" className={className} style={lineOpacity}>
        <path d="M8 34C14 24 22 16 34 8" fill="none" stroke={d2} strokeWidth="2" strokeLinecap="round" />
        <path d="M0 0C4-6 12-6 16 0C12 6 4 6 0 0Z" transform="translate(16 24) rotate(-50)" fill={d1} />
        <path d="M0 0C4-6 12-6 16 0C12 6 4 6 0 0Z" transform="translate(26 15) rotate(-60)" fill={d1} />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className={className} style={lineOpacity}>
      <path d="M6 32C12 14 24 8 36 10" fill="none" stroke={d1} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

/** Слот 5. Подложка кнопки записи: родитель — relative-обёртка кнопки. */
export function BrandCtaUnderlay({ decor }: DecorProps) {
  if (!decor || decor === "none") return null;

  if (decor === "geometric") {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1.5 -right-1.5 left-1.5 top-1.5 border"
        style={{ borderColor: d1, borderRadius: "var(--brand-radius-button)" }}
      />
    );
  }

  if (decor === "botanical") {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-2 -inset-y-1.5 rounded-full bg-accent-soft"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-2 -left-1.5 -right-2.5 -top-0.5 -rotate-[1.5deg] rounded-2xl opacity-55"
      style={{ backgroundColor: d2 }}
    />
  );
}

/**
 * Слот 6. Узор в подвале: полоса над подписью «Создано в okno». Высота
 * фиксированная, в поток вёрстки не встаёт — лежит в отступе над подвалом.
 */
export function BrandFooterDecor({ decor }: DecorProps) {
  if (!decor || decor === "none") return null;

  const pattern =
    decor === "geometric"
      ? `repeating-linear-gradient(135deg, ${d1} 0 1px, transparent 1px 12px)`
      : decor === "botanical"
        ? `radial-gradient(circle at 6px 6px, ${d2} 0 2px, transparent 2.5px) 0 0 / 18px 12px, radial-gradient(circle at 15px 9px, ${d1} 0 1.5px, transparent 2px) 0 0 / 18px 12px`
        : `repeating-linear-gradient(170deg, ${d2} 0 5px, transparent 5px 16px)`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-5 h-3 rounded-full"
      style={{ background: pattern, ...backdropOpacity }}
    />
  );
}
