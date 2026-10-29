import type { BrandTheme } from "@/lib/brand-theme/schema";

const defaults = {
  decorSlots: { hero: true, avatar: true, dividers: true, cards: true, cta: true, footer: false },
  decorIntensity: 60,
  logo: null,
} as const;

// Темы из макета «дизайн создания публичной страницы» (PublicPage.dc.html):
// три контрастных бренда, на которых видно, что система тянет и светлую
// пастель, и тёмный барбершоп. Нужны превью в настройках и тестам.

export const brandThemeSamples = {
  // Нейл-студия «Пудра»: пудровый розовый, антиква в заголовках, ботаника.
  rose: {
    version: 1,
    scheme: "light",
    colors: {
      background: "#f8f0ea",
      card: "#fffaf6",
      panel: "#f0e2d9",
      ink: "#3a2a2c",
      inkSoft: "#5c4649",
      muted: "#745c5f",
      line: "#e3cfc4",
      accent: "#c98f93",
      accentSoft: "#f3dcdc",
      accentDeep: "#8e4a55",
      button: "#8e4a55",
      buttonText: "#ffffff",
      secondary: "#f8ece6",
      decor1: "#c98f93",
      decor2: "#9db39f",
    },
    fonts: {
      heading: "cormorant-garamond",
      body: "nunito",
      headingWeight: 600,
      headingTracking: -0.01,
    },
    radius: { card: 22, button: 999, image: 16 },
    shadow: "soft",
    decor: "botanical",
    ...defaults,
  },
  // Барбершоп «Латунь»: почти чёрный, латунь, острые углы, геометрия.
  brass: {
    version: 1,
    scheme: "dark",
    colors: {
      background: "#12110f",
      card: "#1b1916",
      panel: "#1b1916",
      ink: "#f1eadb",
      inkSoft: "#cdc3ad",
      muted: "#a39a85",
      line: "#3a3428",
      accent: "#c9a24f",
      accentSoft: "#2a2418",
      accentDeep: "#e0bd6a",
      button: "#c9a24f",
      buttonText: "#15120a",
      secondary: "#23201b",
      decor1: "#c9a24f",
      decor2: "#7d6630",
    },
    fonts: {
      heading: "playfair-display",
      body: "jost",
      headingWeight: 700,
      headingTracking: 0,
    },
    radius: { card: 4, button: 2, image: 2 },
    shadow: "deep",
    decor: "geometric",
    ...defaults,
  },
  // Бровист Brow Mira: кобальт, жирный гротеск, мазки кистью.
  cobalt: {
    version: 1,
    scheme: "light",
    colors: {
      background: "#f6f3ec",
      card: "#ffffff",
      panel: "#e3e7ff",
      ink: "#101840",
      inkSoft: "#2f3868",
      muted: "#4f5782",
      line: "#cfd4f2",
      accent: "#1f3df0",
      accentSoft: "#dfe4ff",
      accentDeep: "#1f3df0",
      button: "#1f3df0",
      buttonText: "#ffffff",
      secondary: "#eef0ff",
      decor1: "#1f3df0",
      decor2: "#9db0ff",
    },
    fonts: {
      heading: "unbounded",
      body: "rubik",
      headingWeight: 700,
      headingTracking: -0.02,
    },
    radius: { card: 20, button: 14, image: 18 },
    shadow: "soft",
    decor: "brush",
    ...defaults,
  },
} satisfies Record<string, BrandTheme>;
