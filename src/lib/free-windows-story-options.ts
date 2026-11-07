import type { BookingThemePresetId } from "@/lib/booking-theme-presets";

// Варианты картинки «Горящие окошки» для сторис: что выбирает мастер в окне
// выбора. Отдельно от рендера (free-windows-story.ts), потому что окно выбора
// живёт в браузере, а рендер тянет fs и satori.

// brand — «Мой стиль»: картинка в фирменном стиле мастера (цвета, шрифты,
// декор и логотип его публичной страницы, src/lib/brand-theme). Есть в выборе,
// только когда фирменный стиль применён; палитра для него не нужна.
export const storyStyles = ["light", "arch", "ink", "brand"] as const;
export type StoryStyle = (typeof storyStyles)[number];

export const storyStyleLabels: Record<StoryStyle, string> = {
  light: "Светлая",
  arch: "Арка",
  ink: "Тёмная",
  brand: "Мой стиль",
};

export const storyPalettes = ["sage", "olive", "merlot", "lagoon", "rosewood"] as const;
export type StoryPalette = (typeof storyPalettes)[number];

export const storyPaletteMeta: Record<StoryPalette, { name: string; swatch: string }> = {
  sage: { name: "Шалфей", swatch: "#b8d3c4" },
  olive: { name: "Олива", swatch: "#4e5f40" },
  merlot: { name: "Бордо", swatch: "#691d20" },
  lagoon: { name: "Лагуна", swatch: "#17475d" },
  rosewood: { name: "Розовое дерево", swatch: "#9c5869" },
};

// По умолчанию сторис в цвет страницы записи мастера: светлый лен — это
// нейтральный «Шалфей» из бренда, остальные темы совпадают по имени.
export function defaultStoryPalette(themePresetId: BookingThemePresetId): StoryPalette {
  return themePresetId === "linen" ? "sage" : themePresetId;
}

export function parseStoryStyle(value: unknown): StoryStyle {
  return storyStyles.includes(value as StoryStyle) ? (value as StoryStyle) : "light";
}

export function parseStoryPalette(value: unknown): StoryPalette | null {
  return storyPalettes.includes(value as StoryPalette) ? (value as StoryPalette) : null;
}
