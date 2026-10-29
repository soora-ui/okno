import type { BrandFontId, BrandTheme } from "@/lib/brand-theme/schema";

// Фирменная тема ложится на те же CSS-переменные, что и пресеты
// (booking-theme-presets.ts), поэтому компоненты публичной страницы о ней
// ничего не знают. Сверху добавляются то, чего у пресетов нет: шрифты,
// скругления, тени и цвета декора.

export const brandThemeAttrValue = "brand";

const selector = `[data-booking-theme="${brandThemeAttrValue}"]`;

function rgba(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function shadows(theme: BrandTheme) {
  if (theme.shadow === "none") {
    return { subtle: "none", card: "none", section: "none", hover: "none" };
  }

  // На тёмном фоне тень цвета текста светится, поэтому там — чёрная.
  const base = theme.scheme === "dark" ? "#000000" : theme.colors.ink;
  const k = theme.shadow === "deep" ? 2 : 1;
  const dark = theme.scheme === "dark" ? 4 : 1;
  return {
    subtle: `0 10px 30px ${rgba(base, 0.04 * k * dark)}`,
    card: `0 24px 80px ${rgba(base, 0.08 * k * dark)}`,
    section: `0 32px 120px ${rgba(base, 0.08 * k * dark)}`,
    hover: `0 30px 90px ${rgba(base, 0.14 * k * dark)}`,
  };
}

export function brandThemeVars(
  theme: BrandTheme,
  fontFamily: (id: BrandFontId) => string,
): Record<`--${string}`, string> {
  const { colors, radius } = theme;
  const dark = theme.scheme === "dark";
  const shadow = shadows(theme);

  return {
    "--color-ink": colors.ink,
    "--color-ink-soft": colors.inkSoft,
    "--color-muted": colors.muted,
    "--color-line": colors.line,
    "--color-panel": colors.panel,
    "--color-accent": colors.accent,
    "--color-accent-soft": colors.accentSoft,
    "--color-accent-deep": colors.accentDeep,
    "--ui-card-bg": colors.card,
    "--ui-field-bg": colors.card,
    "--ui-placeholder": colors.muted,
    "--ui-primary-bg": colors.button,
    "--ui-primary-text": colors.buttonText,
    "--color-background": colors.background,
    "--color-surface": colors.card,
    "--color-surface-strong": colors.card,
    "--color-ink-contrast": colors.buttonText,
    "--ui-secondary-bg": colors.secondary,
    "--ui-secondary-border": colors.line,
    // В :root эти две заданы через var(--color-ink) и наследуются уже
    // вычисленными — без явного значения вторичная кнопка тёмного бренда
    // получила бы тёмный текст okno на тёмном фоне.
    "--ui-secondary-text": colors.ink,
    "--ui-ghost-text": colors.ink,
    "--public-surface": rgba(colors.card, 0.78),
    "--public-surface-strong": rgba(colors.card, 0.88),
    "--public-edge": dark ? rgba(colors.line, 0.8) : "rgba(255,255,255,0.8)",
    "--public-glow-a": rgba(colors.accent, dark ? 0.12 : 0.24),
    "--public-glow-b": dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.72)",
    "--public-glow-c": rgba(colors.background, 0.92),
    // Тёмный блок «Как всё устроено» с белым текстом: у светлого бренда он
    // из его чернил, у тёмного — из его же поверхностей, а не из чернил
    // okno, которые на чужой палитре выглядят чужеродно.
    "--gradient-ink": dark
      ? `linear-gradient(135deg, ${colors.card} 0%, ${colors.secondary} 100%)`
      : `linear-gradient(135deg, ${colors.ink} 0%, ${colors.inkSoft} 100%)`,
    // Tailwind-утилиты font-sans, rounded-* и shadow-* читают эти переменные,
    // поэтому переопределение внутри корня страницы их и перестраивает.
    "--font-manrope": fontFamily(theme.fonts.body),
    "--radius-section": `${radius.card + 4}px`,
    "--radius-card": `${radius.card}px`,
    "--radius-nested": `${Math.max(radius.card - 4, 0)}px`,
    "--radius-panel": `${Math.max(radius.card - 8, 0)}px`,
    "--radius-field": `${Math.min(radius.button, 16)}px`,
    "--radius-tight": `${Math.min(radius.image, 12)}px`,
    "--shadow-subtle": shadow.subtle,
    "--shadow-card": shadow.card,
    "--shadow-section": shadow.section,
    "--shadow-hover": shadow.hover,
    "--brand-font-heading": fontFamily(theme.fonts.heading),
    "--brand-heading-weight": String(theme.fonts.headingWeight),
    "--brand-heading-tracking": `${theme.fonts.headingTracking}em`,
    "--brand-radius-button": `${radius.button}px`,
    "--brand-radius-image": `${radius.image}px`,
    "--brand-decor-1": colors.decor1,
    "--brand-decor-2": colors.decor2,
    // Интенсивность декора (4.12): фоновые рисунки берут её как есть,
    // линейные — от 0,4 до 1, чтобы на минимуме не пропадать совсем.
    "--brand-decor-opacity": String(theme.decorIntensity / 100),
  };
}

export function brandThemeCss(
  theme: BrandTheme,
  fontFamily: (id: BrandFontId) => string,
): string {
  const vars = Object.entries(brandThemeVars(theme, fontFamily))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

  // Заголовки и кнопки отдельными правилами: у них в разметке жёсткие
  // утилиты (tracking-[-0.04em], rounded-full), которые переменные не задевают.
  return [
    // font-family и color явно: body задаёт их выше по дереву, и потомки
    // наследуют уже вычисленное значение, а не переопределённую переменную.
    `${selector}{color-scheme:${theme.scheme};${vars};font-family:var(--font-manrope);color:var(--color-ink)}`,
    `${selector} :is(h1,h2,h3){font-family:var(--brand-font-heading);font-weight:var(--brand-heading-weight);letter-spacing:var(--brand-heading-tracking)}`,
    `${selector} [data-ui-button]{border-radius:var(--brand-radius-button)}`,
  ].join("");
}
