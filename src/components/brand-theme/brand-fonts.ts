import {
  Caveat,
  Comfortaa,
  Cormorant_Garamond,
  Inter,
  Jost,
  Lora,
  Manrope,
  Montserrat,
  Nunito,
  PT_Serif,
  Playfair_Display,
  Rubik,
  Unbounded,
} from "next/font/google";
import type { BrandFontId } from "@/lib/brand-theme/schema";

// Белый список шрифтов фирменного стиля: все с кириллицей, все с Google
// Fonts, поэтому их можно отдавать со своего домена через next/font. Шрифт
// из брендбука мастера (часто платный или без кириллицы) ИИ заменяет
// ближайшим отсюда. preload выключен: из тринадцати семейств странице
// нужны максимум два, и браузер скачает только их. Опции — литералами:
// next/font разбирает их статически и вынесенную переменную не принимает.
const manrope = Manrope({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const inter = Inter({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const montserrat = Montserrat({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const jost = Jost({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const rubik = Rubik({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  display: "swap",
  preload: false,
});
const playfair = Playfair_Display({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const lora = Lora({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const ptSerif = PT_Serif({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});
const unbounded = Unbounded({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const comfortaa = Comfortaa({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const caveat = Caveat({ subsets: ["latin", "cyrillic"], display: "swap", preload: false });

const fonts: Record<BrandFontId, { label: string; family: string }> = {
  manrope: { label: "Manrope", family: manrope.style.fontFamily },
  inter: { label: "Inter", family: inter.style.fontFamily },
  montserrat: { label: "Montserrat", family: montserrat.style.fontFamily },
  nunito: { label: "Nunito", family: nunito.style.fontFamily },
  jost: { label: "Jost", family: jost.style.fontFamily },
  rubik: { label: "Rubik", family: rubik.style.fontFamily },
  "cormorant-garamond": {
    label: "Cormorant Garamond",
    family: cormorant.style.fontFamily,
  },
  "playfair-display": {
    label: "Playfair Display",
    family: playfair.style.fontFamily,
  },
  lora: { label: "Lora", family: lora.style.fontFamily },
  "pt-serif": { label: "PT Serif", family: ptSerif.style.fontFamily },
  unbounded: { label: "Unbounded", family: unbounded.style.fontFamily },
  comfortaa: { label: "Comfortaa", family: comfortaa.style.fontFamily },
  caveat: { label: "Caveat", family: caveat.style.fontFamily },
};

export function brandFontFamily(id: BrandFontId): string {
  return fonts[id].family;
}

export function brandFontLabel(id: BrandFontId): string {
  return fonts[id].label;
}
