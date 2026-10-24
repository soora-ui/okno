import type { BrandTheme, BrandThemeColors } from "@/lib/brand-theme/schema";

// Читаемость фирменной темы (ТЗ 4.12, «Проверяем читаемость»). Тему может
// собрать ИИ, а позже — подкрутить мастер вручную, поэтому перед показом
// и перед сохранением каждая пара «текст на фоне» проверяется по WCAG AA
// и, если не проходит, текст (или тёмная подложка) сдвигается к чёрному
// или белому, пока не начнёт читаться. Фон бренда не трогаем: это его
// главный цвет, а сдвинуть текст почти всегда незаметнее.

export const minTextContrast = 4.5;

type ColorRole = keyof BrandThemeColors;

type ContrastPair = {
  // Что двигаем, если пара не читается.
  adjust: ColorRole;
  // На чём это лежит: роль темы или фиксированный цвет.
  against: ColorRole | `#${string}`;
  // Как это называется для мастера в предупреждении.
  label: string;
  // У фиксированного белого текста двигаем фон, а не текст.
  adjustIsBackground?: boolean;
};

function pairsFor(theme: BrandTheme): ContrastPair[] {
  const pairs: ContrastPair[] = [
    { adjust: "ink", against: "background", label: "Основной текст на фоне страницы" },
    { adjust: "ink", against: "card", label: "Основной текст на карточках" },
    { adjust: "inkSoft", against: "card", label: "Описания на карточках" },
    { adjust: "muted", against: "card", label: "Подписи на карточках" },
    { adjust: "buttonText", against: "button", label: "Текст на кнопке записи" },
    { adjust: "accentDeep", against: "accentSoft", label: "Метки и бейджи" },
    { adjust: "ink", against: "accentSoft", label: "Текст на выделенных карточках" },
    { adjust: "ink", against: "secondary", label: "Текст на второстепенных кнопках" },
  ];

  // Блок «Как всё устроено» — белый текст на градиенте: у светлого бренда
  // из чернил, у тёмного — из его поверхностей (css.ts, --gradient-ink).
  if (theme.scheme === "light") {
    pairs.push({ adjust: "inkSoft", against: "#ffffff", label: "Белый текст на тёмном блоке", adjustIsBackground: true });
  } else {
    pairs.push({ adjust: "secondary", against: "#ffffff", label: "Белый текст на тёмном блоке", adjustIsBackground: true });
  }

  return pairs;
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(hex: string, target: string, amount: number) {
  const from = channels(hex);
  const to = channels(target);
  return toHex([
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ]);
}

/**
 * Сдвигает color к чёрному или белому (в сторону, где контраст с фоном
 * растёт), пока пара не наберёт min. Шаг мелкий, чтобы оттенок бренда
 * сохранялся настолько, насколько это вообще возможно.
 */
export function ensureContrast(color: string, background: string, min = minTextContrast) {
  if (contrastRatio(color, background) >= min) return color;

  const towardBlack = relativeLuminance(background) > 0.18;
  const target = towardBlack ? "#000000" : "#ffffff";
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(color, target, step / 20);
    if (contrastRatio(candidate, background) >= min) return candidate;
  }
  return target;
}

export type ContrastFix = {
  label: string;
  role: ColorRole;
  from: string;
  to: string;
};

/**
 * Проверяет и чинит тему. Возвращает исправленную тему и список правок —
 * интерфейс показывает их мастеру («Мы немного затемнили кнопку…»).
 */
export function fixBrandThemeContrast(theme: BrandTheme): {
  theme: BrandTheme;
  fixes: ContrastFix[];
} {
  const colors = { ...theme.colors };
  const fixes: ContrastFix[] = [];

  // Два прохода: правка одной пары (скажем, ink для фона) может зацепить
  // следующую, где ink лежит на другой подложке.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const pair of pairsFor(theme)) {
      const against = pair.against.startsWith("#")
        ? pair.against
        : colors[pair.against as ColorRole];
      const current = colors[pair.adjust];
      const next = ensureContrast(current, against);
      if (next !== current) {
        fixes.push({ label: pair.label, role: pair.adjust, from: current, to: next });
        colors[pair.adjust] = next;
      }
    }
  }

  return { theme: { ...theme, colors }, fixes };
}

export function brandThemeContrastIssues(theme: BrandTheme) {
  return pairsFor(theme)
    .map((pair) => {
      const against = pair.against.startsWith("#")
        ? pair.against
        : theme.colors[pair.against as ColorRole];
      return { ...pair, ratio: contrastRatio(theme.colors[pair.adjust], against) };
    })
    .filter((pair) => pair.ratio < minTextContrast);
}
