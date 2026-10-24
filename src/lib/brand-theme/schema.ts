import { z } from "zod";

// Фирменный стиль мастера (okno-tz-brand-theme-ui.md). Это не вёрстка, а
// набор токенов: структура страницы, порядок блоков и запись остаются
// общими для всех, меняется только оформление. Всё, что сюда попадает,
// потом уходит в CSS публичной страницы, поэтому схема строгая: цвета —
// только #rrggbb, шрифты — только из белого списка, декор — только наши
// заготовленные стили. Свободного текста, который мог бы стать CSS или
// разметкой, в теме нет.

export const brandFontIds = [
  "manrope",
  "inter",
  "montserrat",
  "nunito",
  "jost",
  "rubik",
  "cormorant-garamond",
  "playfair-display",
  "lora",
  "pt-serif",
  "unbounded",
  "comfortaa",
  "caveat",
] as const;

export type BrandFontId = (typeof brandFontIds)[number];

// Стили декора — наша библиотека SVG (components/brand-theme/brand-decor.tsx).
// ИИ выбирает стиль и цвета, но не рисует произвольный SVG.
export const brandDecorStyles = ["none", "botanical", "geometric", "brush"] as const;

export type BrandDecorStyle = (typeof brandDecorStyles)[number];

export const brandShadowLevels = ["none", "soft", "deep"] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет в формате #rrggbb");

export const brandThemeColorsSchema = z.object({
  background: hexColor,
  card: hexColor,
  panel: hexColor,
  ink: hexColor,
  inkSoft: hexColor,
  muted: hexColor,
  line: hexColor,
  accent: hexColor,
  accentSoft: hexColor,
  accentDeep: hexColor,
  button: hexColor,
  buttonText: hexColor,
  secondary: hexColor,
  decor1: hexColor,
  decor2: hexColor,
});

export const brandThemeSchema = z.object({
  version: z.literal(1),
  // Фирменная тема не переключается за телефоном клиента: бренд — это и есть
  // его цвета. Тёмный бренд (барбершоп на чёрном) объявляет scheme: "dark".
  scheme: z.enum(["light", "dark"]),
  colors: brandThemeColorsSchema,
  fonts: z.object({
    heading: z.enum(brandFontIds),
    body: z.enum(brandFontIds),
    headingWeight: z.number().int().min(400).max(800),
    // em: от плотного -0.05 до разрядки 0.2 у капса в духе «ЛАТУНЬ».
    headingTracking: z.number().min(-0.05).max(0.2),
  }),
  radius: z.object({
    card: z.number().int().min(0).max(40),
    // 999 — пилюля.
    button: z.number().int().min(0).max(999),
    image: z.number().int().min(0).max(40),
  }),
  shadow: z.enum(brandShadowLevels),
  decor: z.enum(brandDecorStyles),
});

export type BrandTheme = z.infer<typeof brandThemeSchema>;
export type BrandThemeColors = z.infer<typeof brandThemeColorsSchema>;

// Тема из базы читается мягко: битая или старая запись не должна ронять
// публичную страницу, мастер просто увидит свой пресет.
export function normalizeBrandTheme(value: unknown): BrandTheme | null {
  const parsed = brandThemeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
