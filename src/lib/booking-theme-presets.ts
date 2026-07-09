import type { CSSProperties } from "react";

export const bookingThemePresetIds = [
  "linen",
  "merlot",
  "lagoon",
  "rosewood",
] as const;

export type BookingThemePresetId = (typeof bookingThemePresetIds)[number];

export const defaultBookingThemePresetId: BookingThemePresetId = "linen";

type BookingThemeStyle = CSSProperties & Record<`--${string}`, string>;

type BookingThemePreset = {
  id: BookingThemePresetId;
  label: string;
  description: string;
  swatches: [string, string, string];
  style: BookingThemeStyle;
};

const presets: Record<BookingThemePresetId, BookingThemePreset> = {
  linen: {
    id: "linen",
    label: "Светлый лен",
    description: "Нейтральный и самый универсальный вариант.",
    swatches: ["#F4F2EF", "#161616", "#D0C0AE"],
    style: {
      "--color-ink": "#161616",
      "--color-ink-soft": "#4b4742",
      "--color-muted": "#736c64",
      "--color-line": "#d8cab9",
      "--color-panel": "#efe8df",
      "--color-accent": "#d0c0ae",
      "--color-accent-soft": "#f4ece3",
      "--ui-card-bg": "#fcfaf7",
      "--ui-field-bg": "#fffdfa",
      "--ui-placeholder": "#8c8379",
      "--ui-primary-bg": "#161616",
      "--ui-primary-text": "#ffffff",
      colorScheme: "light",
      "--color-background": "#faf7f1",
      "--color-surface": "#ffffff",
      "--color-surface-strong": "#ffffff",
      "--color-ink-contrast": "#ffffff",
      "--ui-secondary-bg": "#f7f1ea",
      "--ui-secondary-border": "#d8cab9",
      "--public-surface": "rgba(252,250,247,0.78)",
      "--public-surface-strong": "rgba(255,253,250,0.88)",
      "--public-edge": "rgba(255,255,255,0.8)",
      "--public-glow-a": "rgba(208,192,174,0.24)",
      "--public-glow-b": "rgba(255,255,255,0.72)",
      "--public-glow-c": "rgba(244,242,239,0.92)",
    },
  },
  merlot: {
    id: "merlot",
    label: "Бордо",
    description: "Тёплая тема с акцентом на глубокий красный.",
    swatches: ["#C7C6C1", "#2D2825", "#691D20"],
    style: {
      "--color-ink": "#2D2825",
      "--color-ink-soft": "#58514b",
      "--color-muted": "#756a64",
      "--color-line": "#d2c5bd",
      "--color-panel": "#ede7e1",
      "--color-accent": "#691D20",
      "--color-accent-soft": "#f2e4e5",
      "--ui-card-bg": "#faf7f4",
      "--ui-field-bg": "#fefbf8",
      "--ui-placeholder": "#93867f",
      "--ui-primary-bg": "#691D20",
      "--ui-primary-text": "#ffffff",
      colorScheme: "light",
      "--color-background": "#faf7f1",
      "--color-surface": "#ffffff",
      "--color-surface-strong": "#ffffff",
      "--color-ink-contrast": "#ffffff",
      "--ui-secondary-bg": "#f5efea",
      "--ui-secondary-border": "#d2c5bd",
      "--public-surface": "rgba(252,247,245,0.8)",
      "--public-surface-strong": "rgba(255,250,248,0.9)",
      "--public-edge": "rgba(255,244,242,0.78)",
      "--public-glow-a": "rgba(105,29,32,0.18)",
      "--public-glow-b": "rgba(255,250,248,0.72)",
      "--public-glow-c": "rgba(242,228,229,0.86)",
    },
  },
  lagoon: {
    id: "lagoon",
    label: "Лагуна",
    description: "Холодный акцент со сдержанным настроением.",
    swatches: ["#BEBEBE", "#17475D", "#7D6261"],
    style: {
      "--color-ink": "#17475D",
      "--color-ink-soft": "#5f4d4d",
      "--color-muted": "#746566",
      "--color-line": "#cad2d7",
      "--color-panel": "#e8eef1",
      "--color-accent": "#17475D",
      "--color-accent-soft": "#e5eef3",
      "--ui-card-bg": "#fafbfd",
      "--ui-field-bg": "#ffffff",
      "--ui-placeholder": "#7e878d",
      "--ui-primary-bg": "#17475D",
      "--ui-primary-text": "#ffffff",
      colorScheme: "light",
      "--color-background": "#faf7f1",
      "--color-surface": "#ffffff",
      "--color-surface-strong": "#ffffff",
      "--color-ink-contrast": "#ffffff",
      "--ui-secondary-bg": "#f2f6f8",
      "--ui-secondary-border": "#cad2d7",
      "--public-surface": "rgba(248,251,253,0.8)",
      "--public-surface-strong": "rgba(255,255,255,0.9)",
      "--public-edge": "rgba(244,250,253,0.8)",
      "--public-glow-a": "rgba(23,71,93,0.18)",
      "--public-glow-b": "rgba(255,255,255,0.72)",
      "--public-glow-c": "rgba(170,204,241,0.22)",
    },
  },
  rosewood: {
    id: "rosewood",
    label: "Розовое дерево",
    description: "Розово-тауповая тема без лишней приторности.",
    swatches: ["#9C5869", "#D6C8BF", "#4D463C"],
    style: {
      "--color-ink": "#4D463C",
      "--color-ink-soft": "#6a625a",
      "--color-muted": "#857a72",
      "--color-line": "#ddcbc5",
      "--color-panel": "#f0e5df",
      "--color-accent": "#9C5869",
      "--color-accent-soft": "#f6e9ee",
      "--ui-card-bg": "#fff8f5",
      "--ui-field-bg": "#fffdfb",
      "--ui-placeholder": "#93827d",
      "--ui-primary-bg": "#9C5869",
      "--ui-primary-text": "#ffffff",
      colorScheme: "light",
      "--color-background": "#faf7f1",
      "--color-surface": "#ffffff",
      "--color-surface-strong": "#ffffff",
      "--color-ink-contrast": "#ffffff",
      "--ui-secondary-bg": "#f8f1ed",
      "--ui-secondary-border": "#ddcbc5",
      "--public-surface": "rgba(255,248,245,0.8)",
      "--public-surface-strong": "rgba(255,252,250,0.9)",
      "--public-edge": "rgba(255,245,243,0.8)",
      "--public-glow-a": "rgba(156,88,105,0.2)",
      "--public-glow-b": "rgba(255,252,250,0.72)",
      "--public-glow-c": "rgba(214,200,191,0.72)",
    },
  },
};

export const bookingThemePresets = bookingThemePresetIds.map((id) => presets[id]);

export function getBookingThemePreset(
  presetId: BookingThemePresetId,
): BookingThemePreset {
  return presets[presetId];
}

export function normalizeBookingThemePresetId(
  value: unknown,
): BookingThemePresetId {
  if (
    typeof value === "string" &&
    bookingThemePresetIds.includes(value as BookingThemePresetId)
  ) {
    return value as BookingThemePresetId;
  }

  return defaultBookingThemePresetId;
}

export function getBookingThemeStyle(
  presetId: BookingThemePresetId,
): BookingThemeStyle {
  return presets[presetId].style;
}
