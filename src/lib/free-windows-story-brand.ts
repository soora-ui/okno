import { brandLogoPath } from "@/lib/brand-theme/decor";
import type { BrandFontId, BrandTheme } from "@/lib/brand-theme/schema";
import type { StoryBrand } from "@/lib/free-windows-story-template";
import { logError } from "@/lib/observability/logger";
import { resolveProfileMediaUrl } from "@/lib/profile-media";

// «Мой стиль» для серверного рендера сторис: шрифты и логотип фирменной темы
// в том виде, в каком их понимает satori. На странице шрифты приходят через
// next/font (woff2), а satori читает только TTF/OTF/WOFF — поэтому берём их
// у Google Fonts напрямую: без браузерного User-Agent API отдаёт TTF. Если
// сеть подвела, картинка всё равно рисуется — шрифтом Manrope.

type SatoriFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" };

export const brandHeadingFontName = "BrandHeading";
export const brandBodyFontName = "BrandBody";

const googleFamilies: Record<BrandFontId, string> = {
  manrope: "Manrope",
  inter: "Inter",
  montserrat: "Montserrat",
  nunito: "Nunito",
  jost: "Jost",
  rubik: "Rubik",
  "cormorant-garamond": "Cormorant Garamond",
  "playfair-display": "Playfair Display",
  lora: "Lora",
  "pt-serif": "PT Serif",
  unbounded: "Unbounded",
  comfortaa: "Comfortaa",
  caveat: "Caveat",
};

const fetchTimeoutMs = 5000;

// Шрифты не меняются, а процесс живёт долго: качаем каждое начертание один
// раз. Промис, а не результат — параллельные рендеры не качают дважды.
const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

async function downloadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const cssResponse = await fetch(cssUrl, { signal: AbortSignal.timeout(fetchTimeoutMs) });
  // У статичных семейств (PT Serif) нет промежуточных весов — Google отвечает 400.
  if (!cssResponse.ok) return null;
  const css = await cssResponse.text();
  const fontUrl = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
  if (!fontUrl) return null;
  const fontResponse = await fetch(fontUrl, { signal: AbortSignal.timeout(fetchTimeoutMs) });
  return fontResponse.ok ? fontResponse.arrayBuffer() : null;
}

function loadGoogleFont(fontId: BrandFontId, weight: number) {
  const key = `${fontId}:${weight}`;
  let pending = fontCache.get(key);
  if (!pending) {
    pending = downloadGoogleFont(googleFamilies[fontId], weight).catch((error) => {
      logError("Free windows story: brand font download failed", { fontId, weight, error });
      return null;
    });
    // Неудачу не кэшируем навсегда: следующий рендер попробует снова.
    pending.then((data) => {
      if (!data) fontCache.delete(key);
    });
    fontCache.set(key, pending);
  }
  return pending;
}

// Ближайший доступный вес: сначала нужный, потом обычные 400 и 700.
async function loadNearestWeight(fontId: BrandFontId, weight: number) {
  for (const candidate of [weight, 400, 700]) {
    const data = await loadGoogleFont(fontId, candidate);
    if (data) return { data, weight: candidate };
  }
  return null;
}

function satoriWeight(weight: number): SatoriFont["weight"] {
  const allowed = [400, 500, 600, 700, 800] as const;
  return allowed.reduce((best, item) => (Math.abs(item - weight) < Math.abs(best - weight) ? item : best));
}

async function loadLogoDataUri(theme: BrandTheme) {
  const url = resolveProfileMediaUrl(brandLogoPath(theme));
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    // Логотип хранится растеризованным в PNG (lib/brand-theme/schema.ts).
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (error) {
    logError("Free windows story: brand logo download failed", { error });
    return null;
  }
}

export async function loadServerStoryBrand(theme: BrandTheme): Promise<{
  brand: StoryBrand;
  fonts: SatoriFont[];
  // Шрифт темы не скачался — под его именем отдадим Manrope.
  fallbackFontNames: string[];
}> {
  const [heading, bodyRegular, bodyMedium, bodySemibold, logoSrc] = await Promise.all([
    loadNearestWeight(theme.fonts.heading, theme.fonts.headingWeight),
    loadNearestWeight(theme.fonts.body, 400),
    loadNearestWeight(theme.fonts.body, 500),
    loadNearestWeight(theme.fonts.body, 600),
    loadLogoDataUri(theme),
  ]);

  const fonts: SatoriFont[] = [];
  const fallbackFontNames: string[] = [];

  if (heading) {
    fonts.push({ name: brandHeadingFontName, data: heading.data, weight: satoriWeight(heading.weight), style: "normal" });
  } else {
    fallbackFontNames.push(brandHeadingFontName);
  }

  const body = [bodyRegular, bodyMedium, bodySemibold].filter((item) => item !== null);
  if (body.length > 0) {
    for (const item of body) {
      fonts.push({ name: brandBodyFontName, data: item.data, weight: satoriWeight(item.weight), style: "normal" });
    }
  } else {
    fallbackFontNames.push(brandBodyFontName);
  }

  return {
    brand: {
      theme,
      logoSrc,
      headingFont: brandHeadingFontName,
      bodyFont: brandBodyFontName,
    },
    fonts,
    fallbackFontNames,
  };
}
