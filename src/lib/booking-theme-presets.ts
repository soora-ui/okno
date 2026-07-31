export const bookingThemePresetIds = [
  "linen",
  "olive",
  "merlot",
  "lagoon",
  "rosewood",
] as const;

export type BookingThemePresetId = (typeof bookingThemePresetIds)[number];

export const defaultBookingThemePresetId: BookingThemePresetId = "linen";

type BookingThemeVars = Record<`--${string}`, string>;

type BookingThemePreset = {
  id: BookingThemePresetId;
  label: string;
  description: string;
  /** Три цвета для кружков в выборе пресета: светлый и тёмный варианты. */
  swatches: [string, string, string];
  darkSwatches: [string, string, string];
  light: BookingThemeVars;
  dark: BookingThemeVars;
};

// Пресеты больше не отдаются инлайновым style: инлайн не умеет нести
// медиавыражение, поэтому тёмная тема с ним была невозможна в принципе —
// клиент с тёмным телефоном всегда получал светлую страницу. Теперь это
// data-атрибут плюс сгенерированный CSS с обеими темами.
//
// Тёмные варианты собраны не инверсией: тёмные акценты вроде бордо #691D20
// на тёмном фоне не читаются, поэтому акцент в тёмной паре осветлён, а роль
// «текст на акценте» переворачивается на тёмную.
const presets: Record<BookingThemePresetId, BookingThemePreset> = {
  linen: {
    id: "linen",
    label: "Светлый лен",
    description: "Нейтральный и самый универсальный вариант.",
    swatches: ["#F4F2EF", "#161616", "#D0C0AE"],
    darkSwatches: ["#201E18", "#F2EDE2", "#D0C0AE"],
    light: {
      "--color-ink": "#161616",
      "--color-ink-soft": "#4b4742",
      "--color-muted": "#736c64",
      "--color-line": "#d8cab9",
      "--color-panel": "#efe8df",
      "--color-accent": "#d0c0ae",
      "--color-accent-soft": "#f4ece3",
      "--color-accent-deep": "#6f6250",
      "--ui-card-bg": "#fcfaf7",
      "--ui-field-bg": "#fffdfa",
      "--ui-placeholder": "#8c8379",
      "--ui-primary-bg": "#161616",
      "--ui-primary-text": "#ffffff",
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
    dark: {
      "--color-ink": "#f2ede2",
      "--color-ink-soft": "#cdc6b8",
      "--color-muted": "#9a9384",
      "--color-line": "#3a352c",
      "--color-panel": "#221f19",
      "--color-accent": "#d0c0ae",
      "--color-accent-soft": "#2e281f",
      "--color-accent-deep": "#e0d3c3",
      "--ui-card-bg": "#201e18",
      "--ui-field-bg": "#25231b",
      "--ui-placeholder": "#8c8479",
      "--ui-primary-bg": "#d0c0ae",
      "--ui-primary-text": "#1a1712",
      "--color-background": "#181712",
      "--color-surface": "#201e18",
      "--color-surface-strong": "#2a2821",
      "--color-ink-contrast": "#181712",
      "--ui-secondary-bg": "#2a2821",
      "--ui-secondary-border": "#3a352c",
      "--public-surface": "rgba(32,30,24,0.78)",
      "--public-surface-strong": "rgba(42,40,33,0.88)",
      "--public-edge": "rgba(58,53,44,0.8)",
      "--public-glow-a": "rgba(208,192,174,0.12)",
      "--public-glow-b": "rgba(255,255,255,0.04)",
      "--public-glow-c": "rgba(24,23,18,0.9)",
    },
  },
  olive: {
    id: "olive",
    label: "Олива",
    description: "Глубокий оливковый на тёплом бежевом, чернила почти чёрные.",
    swatches: ["#ECE5D2", "#1A1A1A", "#4E5F40"],
    darkSwatches: ["#1E2219", "#EDE6D3", "#A3B587"],
    light: {
      "--color-ink": "#1a1a1a",
      "--color-ink-soft": "#45463f",
      "--color-muted": "#6b6c62",
      "--color-line": "#d3cdb8",
      "--color-panel": "#e3dcc6",
      "--color-accent": "#4e5f40",
      "--color-accent-soft": "#e4e6d6",
      "--color-accent-deep": "#3c4a31",
      "--ui-card-bg": "#f7f2e5",
      "--ui-field-bg": "#fbf8ee",
      "--ui-placeholder": "#6f7061",
      "--ui-primary-bg": "#4e5f40",
      "--ui-primary-text": "#f6f1e3",
      "--color-background": "#ece5d2",
      "--color-surface": "#f6f1e3",
      "--color-surface-strong": "#f9f5ea",
      "--color-ink-contrast": "#f6f1e3",
      "--ui-secondary-bg": "#f1ebda",
      "--ui-secondary-border": "#d3cdb8",
      "--public-surface": "rgba(247,242,229,0.8)",
      "--public-surface-strong": "rgba(251,248,238,0.9)",
      "--public-edge": "rgba(255,253,246,0.78)",
      "--public-glow-a": "rgba(78,95,64,0.18)",
      "--public-glow-b": "rgba(251,248,238,0.72)",
      "--public-glow-c": "rgba(227,220,198,0.86)",
    },
    dark: {
      "--color-ink": "#ede6d3",
      "--color-ink-soft": "#c9c4b0",
      "--color-muted": "#94917f",
      "--color-line": "#343a2a",
      "--color-panel": "#1f2318",
      "--color-accent": "#a3b587",
      "--color-accent-soft": "#262c1d",
      "--color-accent-deep": "#bccaa4",
      "--ui-card-bg": "#1e2219",
      "--ui-field-bg": "#232818",
      "--ui-placeholder": "#918e79",
      "--ui-primary-bg": "#a3b587",
      "--ui-primary-text": "#171a13",
      "--color-background": "#171a13",
      "--color-surface": "#1e2219",
      "--color-surface-strong": "#272c20",
      "--color-ink-contrast": "#171a13",
      "--ui-secondary-bg": "#272c20",
      "--ui-secondary-border": "#343a2a",
      "--public-surface": "rgba(30,34,25,0.78)",
      "--public-surface-strong": "rgba(39,44,32,0.88)",
      "--public-edge": "rgba(52,58,42,0.8)",
      "--public-glow-a": "rgba(163,181,135,0.12)",
      "--public-glow-b": "rgba(255,255,255,0.04)",
      "--public-glow-c": "rgba(23,26,19,0.9)",
    },
  },
  merlot: {
    id: "merlot",
    label: "Бордо",
    description: "Тёплая тема с акцентом на глубокий красный.",
    swatches: ["#C7C6C1", "#2D2825", "#691D20"],
    darkSwatches: ["#221A19", "#F4ECE9", "#C9737A"],
    light: {
      "--color-ink": "#2D2825",
      "--color-ink-soft": "#58514b",
      "--color-muted": "#756a64",
      "--color-line": "#d2c5bd",
      "--color-panel": "#ede7e1",
      "--color-accent": "#691D20",
      "--color-accent-soft": "#f2e4e5",
      "--color-accent-deep": "#571719",
      "--ui-card-bg": "#faf7f4",
      "--ui-field-bg": "#fefbf8",
      "--ui-placeholder": "#93867f",
      "--ui-primary-bg": "#691D20",
      "--ui-primary-text": "#ffffff",
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
    dark: {
      "--color-ink": "#f4ece9",
      "--color-ink-soft": "#d3c4bf",
      "--color-muted": "#a2918b",
      "--color-line": "#3d3230",
      "--color-panel": "#241d1c",
      "--color-accent": "#c9737a",
      "--color-accent-soft": "#33201f",
      "--color-accent-deep": "#dc949a",
      "--ui-card-bg": "#221a19",
      "--ui-field-bg": "#271e1d",
      "--ui-placeholder": "#907f7a",
      "--ui-primary-bg": "#c9737a",
      "--ui-primary-text": "#1a1413",
      "--color-background": "#1a1413",
      "--color-surface": "#221a19",
      "--color-surface-strong": "#2c2322",
      "--color-ink-contrast": "#1a1413",
      "--ui-secondary-bg": "#2c2322",
      "--ui-secondary-border": "#3d3230",
      "--public-surface": "rgba(34,26,25,0.78)",
      "--public-surface-strong": "rgba(44,35,34,0.88)",
      "--public-edge": "rgba(61,50,48,0.8)",
      "--public-glow-a": "rgba(201,115,122,0.14)",
      "--public-glow-b": "rgba(255,255,255,0.04)",
      "--public-glow-c": "rgba(26,20,19,0.9)",
    },
  },
  lagoon: {
    id: "lagoon",
    label: "Лагуна",
    description: "Холодный акцент со сдержанным настроением.",
    swatches: ["#BEBEBE", "#17475D", "#7D6261"],
    darkSwatches: ["#172127", "#E8F0F4", "#7FB6CF"],
    light: {
      "--color-ink": "#17475D",
      "--color-ink-soft": "#5f4d4d",
      "--color-muted": "#746566",
      "--color-line": "#cad2d7",
      "--color-panel": "#e8eef1",
      "--color-accent": "#17475D",
      "--color-accent-soft": "#e5eef3",
      "--color-accent-deep": "#123a4c",
      "--ui-card-bg": "#fafbfd",
      "--ui-field-bg": "#ffffff",
      "--ui-placeholder": "#7e878d",
      "--ui-primary-bg": "#17475D",
      "--ui-primary-text": "#ffffff",
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
    dark: {
      "--color-ink": "#e8f0f4",
      "--color-ink-soft": "#c3d2d9",
      "--color-muted": "#8d9ba3",
      "--color-line": "#2c3a42",
      "--color-panel": "#19242a",
      "--color-accent": "#7fb6cf",
      "--color-accent-soft": "#1b2b33",
      "--color-accent-deep": "#9dc9dd",
      "--ui-card-bg": "#172127",
      "--ui-field-bg": "#1b262c",
      "--ui-placeholder": "#7d8b93",
      "--ui-primary-bg": "#7fb6cf",
      "--ui-primary-text": "#111a1e",
      "--color-background": "#111a1e",
      "--color-surface": "#172127",
      "--color-surface-strong": "#1f2b31",
      "--color-ink-contrast": "#111a1e",
      "--ui-secondary-bg": "#1f2b31",
      "--ui-secondary-border": "#2c3a42",
      "--public-surface": "rgba(23,33,39,0.78)",
      "--public-surface-strong": "rgba(31,43,49,0.88)",
      "--public-edge": "rgba(44,58,66,0.8)",
      "--public-glow-a": "rgba(127,182,207,0.14)",
      "--public-glow-b": "rgba(255,255,255,0.04)",
      "--public-glow-c": "rgba(17,26,30,0.9)",
    },
  },
  rosewood: {
    id: "rosewood",
    label: "Розовое дерево",
    description: "Розово-тауповая тема без лишней приторности.",
    swatches: ["#9C5869", "#D6C8BF", "#4D463C"],
    darkSwatches: ["#221B1C", "#F3EAE9", "#C98494"],
    light: {
      "--color-ink": "#4D463C",
      "--color-ink-soft": "#6a625a",
      "--color-muted": "#857a72",
      "--color-line": "#ddcbc5",
      "--color-panel": "#f0e5df",
      "--color-accent": "#9C5869",
      "--color-accent-soft": "#f6e9ee",
      "--color-accent-deep": "#7f4455",
      "--ui-card-bg": "#fff8f5",
      "--ui-field-bg": "#fffdfb",
      "--ui-placeholder": "#93827d",
      "--ui-primary-bg": "#9C5869",
      "--ui-primary-text": "#ffffff",
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
    dark: {
      "--color-ink": "#f3eae9",
      "--color-ink-soft": "#d5c5c3",
      "--color-muted": "#a08f8c",
      "--color-line": "#3d3230",
      "--color-panel": "#241e1e",
      "--color-accent": "#c98494",
      "--color-accent-soft": "#322326",
      "--color-accent-deep": "#dda3b0",
      "--ui-card-bg": "#221b1c",
      "--ui-field-bg": "#271f20",
      "--ui-placeholder": "#8f7f7d",
      "--ui-primary-bg": "#c98494",
      "--ui-primary-text": "#1a1516",
      "--color-background": "#1a1516",
      "--color-surface": "#221b1c",
      "--color-surface-strong": "#2c2425",
      "--color-ink-contrast": "#1a1516",
      "--ui-secondary-bg": "#2c2425",
      "--ui-secondary-border": "#3d3230",
      "--public-surface": "rgba(34,27,28,0.78)",
      "--public-surface-strong": "rgba(44,36,37,0.88)",
      "--public-edge": "rgba(61,50,48,0.8)",
      "--public-glow-a": "rgba(201,132,148,0.14)",
      "--public-glow-b": "rgba(255,255,255,0.04)",
      "--public-glow-c": "rgba(26,21,22,0.9)",
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

/**
 * Атрибут-переключатель пресета. Вешается на корень клиентского пути мастера;
 * сами значения приходят из <BookingThemeStyles />.
 */
export function bookingThemeAttr(presetId: BookingThemePresetId) {
  return { "data-booking-theme": presetId } as const;
}

const declarations = (vars: BookingThemeVars) =>
  Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

/**
 * CSS всех пресетов: светлая пара как база, тёмная — под prefers-color-scheme.
 * Генерируется из данных выше, чтобы значения не пришлось держать в двух местах.
 * Атрибут `data-booking-theme-mode` позволяет форсировать конкретную тему —
 * это нужно предпросмотру в настройках, где мастер смотрит обе сразу.
 */
export function bookingThemeCss(): string {
  return bookingThemePresets
    .map((preset) => {
      const sel = `[data-booking-theme="${preset.id}"]`;
      const light = `${sel},${sel}[data-booking-theme-mode="light"]{color-scheme:light;${declarations(preset.light)}}`;
      const darkVars = `{color-scheme:dark;${declarations(preset.dark)}}`;
      const auto = `@media (prefers-color-scheme:dark){${sel}:not([data-booking-theme-mode="light"])${darkVars}}`;
      const forced = `${sel}[data-booking-theme-mode="dark"]${darkVars}`;
      return `${light}${auto}${forced}`;
    })
    .join("");
}
