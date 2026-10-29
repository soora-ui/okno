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

// Фиксированные места декора на публичной странице (макет 4.12, «Декор»).
// Мастер включает и выключает каждое отдельно; структура страницы от этого
// не меняется — пустой слот просто ничего не рисует.
export const brandDecorSlots = ["hero", "avatar", "dividers", "cards", "cta", "footer"] as const;

export type BrandDecorSlot = (typeof brandDecorSlots)[number];

// Логотип лежит в profile-media уже растеризованным в PNG (SVG мастера на
// страницу не попадает: в нём мог быть скрипт). Путь проверяется строго,
// чтобы тема не могла сослаться на чужой файл или внешний адрес.
export const brandLogoPathPattern = /^[A-Za-z0-9-]{1,64}\/brand-logo\/[A-Za-z0-9-]{1,100}\.png$/;

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
  // Поля ниже появились с мастером по макетам; у тем, сохранённых раньше,
  // их нет — значения по умолчанию воспроизводят прежний вид.
  decorSlots: z
    .object({
      hero: z.boolean(),
      avatar: z.boolean(),
      dividers: z.boolean(),
      cards: z.boolean(),
      cta: z.boolean(),
      footer: z.boolean(),
    })
    .default({ hero: true, avatar: true, dividers: true, cards: true, cta: true, footer: false }),
  // Интенсивность декора, %: прозрачность рисунков.
  decorIntensity: z.number().int().min(10).max(100).default(60),
  logo: z
    .object({
      path: z.string().regex(brandLogoPathPattern),
      // Логотип теряется на тёмном фоне — мастер может загрузить светлую версию.
      darkPath: z.string().regex(brandLogoPathPattern).nullable(),
    })
    .nullable()
    .default(null),
});

export type BrandTheme = z.infer<typeof brandThemeSchema>;
export type BrandThemeInput = z.input<typeof brandThemeSchema>;
export type BrandThemeColors = z.infer<typeof brandThemeColorsSchema>;

// Тема из базы читается мягко: битая или старая запись не должна ронять
// публичную страницу, мастер просто увидит свой пресет.
export function normalizeBrandTheme(value: unknown): BrandTheme | null {
  const parsed = brandThemeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
