import { formatFreeWindowRanges, type FreeWindowDay } from "@/lib/free-windows";
import type { StoryPalette, StoryStyle } from "@/lib/free-windows-story-options";
import type { BrandDecorStyle, BrandTheme } from "@/lib/brand-theme/schema";

// Шаблон картинки «Горящие окошки» (документы/горящие-окошки.md) — HTML со
// стилями по макету «Горящие окошки»: три стиля × пять палитр, координаты из
// макета 540×960 как есть. Без серверных зависимостей: сервер рисует из него
// PNG (src/lib/free-windows-story.ts), а окно выбора в кабинете показывает
// его же как превью — переключение стиля и цвета без запроса на сервер.
// Каждый блок — с явным display:flex: satori иначе не умеет, и браузер
// тогда раскладывает так же.

export const storyDimensions = { width: 1080, height: 1920 } as const;
export const storyLayout = { width: 540, height: 960 } as const;

type PaletteTokens = {
  bg: string;
  glowA: string;
  glowB: string;
  ring: string;
  ringLine: string;
  surface: string;
  line: string;
  ink: string;
  soft: string;
  deep: string;
  accentSoft: string;
  pillBorder: string;
  cta: string;
  ctaText: string;
  arrowBg: string;
  arrowFg: string;
  avatarBg: string;
  avatarText: string;
  archBg: string;
  archGlow: string;
  inkBg1: string;
  inkBg2: string;
  inkAccent: string;
  inkGlow: string;
  inkRing: string;
};

// Значения — из макета один в один.
export const storyPaletteTokens: Record<StoryPalette, PaletteTokens> = {
  sage: {
    bg: "#faf7f1", glowA: "rgba(184,211,196,0.55)", glowB: "rgba(247,226,211,0.85)", ring: "rgba(184,211,196,0.45)", ringLine: "rgba(35,36,31,0.12)",
    surface: "#ffffff", line: "#d3c5b3", ink: "#23241f", soft: "#434239", deep: "#4b6d5b", accentSoft: "#eef6f0", pillBorder: "#b8d3c4",
    cta: "#23241f", ctaText: "#ffffff", arrowBg: "#b8d3c4", arrowFg: "#23241f", avatarBg: "#b8d3c4", avatarText: "#23241f",
    archBg: "#b8d3c4", archGlow: "rgba(238,246,240,0.7)",
    inkBg1: "#23241f", inkBg2: "#35362f", inkAccent: "#b8d3c4", inkGlow: "rgba(184,211,196,0.3)", inkRing: "rgba(184,211,196,0.12)",
  },
  olive: {
    bg: "#ece5d2", glowA: "rgba(78,95,64,0.28)", glowB: "rgba(251,248,238,0.9)", ring: "rgba(78,95,64,0.22)", ringLine: "rgba(26,26,26,0.14)",
    surface: "#f6f1e3", line: "#d3cdb8", ink: "#1a1a1a", soft: "#45463f", deep: "#3c4a31", accentSoft: "#e4e6d6", pillBorder: "rgba(78,95,64,0.35)",
    cta: "#4e5f40", ctaText: "#f6f1e3", arrowBg: "#f6f1e3", arrowFg: "#3c4a31", avatarBg: "#4e5f40", avatarText: "#f6f1e3",
    archBg: "#c9d1b5", archGlow: "rgba(251,248,238,0.7)",
    inkBg1: "#171a13", inkBg2: "#272c20", inkAccent: "#a3b587", inkGlow: "rgba(163,181,135,0.25)", inkRing: "rgba(163,181,135,0.12)",
  },
  merlot: {
    bg: "#faf7f1", glowA: "rgba(105,29,32,0.22)", glowB: "rgba(242,228,229,0.95)", ring: "rgba(105,29,32,0.16)", ringLine: "rgba(45,40,37,0.14)",
    surface: "#ffffff", line: "#d2c5bd", ink: "#2d2825", soft: "#58514b", deep: "#571719", accentSoft: "#f2e4e5", pillBorder: "rgba(105,29,32,0.3)",
    cta: "#691d20", ctaText: "#ffffff", arrowBg: "#ffffff", arrowFg: "#571719", avatarBg: "#691d20", avatarText: "#ffffff",
    archBg: "#dcb7b9", archGlow: "rgba(242,228,229,0.7)",
    inkBg1: "#1a1413", inkBg2: "#2c2322", inkAccent: "#c9737a", inkGlow: "rgba(201,115,122,0.25)", inkRing: "rgba(201,115,122,0.12)",
  },
  lagoon: {
    bg: "#faf7f1", glowA: "rgba(23,71,93,0.22)", glowB: "rgba(229,238,243,0.95)", ring: "rgba(23,71,93,0.14)", ringLine: "rgba(23,71,93,0.18)",
    surface: "#ffffff", line: "#cad2d7", ink: "#17475d", soft: "#17475d", deep: "#123a4c", accentSoft: "#e5eef3", pillBorder: "rgba(23,71,93,0.3)",
    cta: "#17475d", ctaText: "#ffffff", arrowBg: "#ffffff", arrowFg: "#123a4c", avatarBg: "#17475d", avatarText: "#ffffff",
    archBg: "#a9c8d6", archGlow: "rgba(229,238,243,0.7)",
    inkBg1: "#0f2f3d", inkBg2: "#17475d", inkAccent: "#9cc6d9", inkGlow: "rgba(156,198,217,0.25)", inkRing: "rgba(156,198,217,0.12)",
  },
  rosewood: {
    bg: "#faf7f1", glowA: "rgba(156,88,105,0.26)", glowB: "rgba(246,233,238,0.95)", ring: "rgba(156,88,105,0.18)", ringLine: "rgba(77,70,60,0.14)",
    surface: "#ffffff", line: "#ddcbc5", ink: "#4d463c", soft: "#6a625a", deep: "#7f4455", accentSoft: "#f6e9ee", pillBorder: "rgba(156,88,105,0.35)",
    cta: "#9c5869", ctaText: "#ffffff", arrowBg: "#ffffff", arrowFg: "#7f4455", avatarBg: "#9c5869", avatarText: "#ffffff",
    archBg: "#e3bcc8", archGlow: "rgba(246,233,238,0.7)",
    inkBg1: "#2b2326", inkBg2: "#3f3238", inkAccent: "#d9a0b0", inkGlow: "rgba(217,160,176,0.25)", inkRing: "rgba(217,160,176,0.12)",
  },
};

// Больше в кадр не помещается без мелкого шрифта, а мелкий в сторис не
// читают: при трёх днях — по два окошка (один ряд), при одном-двух — по три.
// Остальное клиент увидит на странице записи.
function maxWindowsPerDay(dayCount: number) {
  return dayCount >= 3 ? 2 : 3;
}

// «transparent» в градиенте satori понимает как прозрачный чёрный, и
// подсветка уходит в серую муть. Гасим тот же цвет до нулевой прозрачности.
function fade(rgba: string) {
  return rgba.replace(/,\s*[\d.]+\)$/, ",0)");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function masterInitials(fullName: string) {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("") || "•"
  );
}

export type StoryInput = {
  days: FreeWindowDay[];
  masterName: string;
  publicLink: string;
  style: StoryStyle;
  palette: StoryPalette;
  // satori знает шрифт по имени Manrope; в браузере он подключён через
  // next/font под своим именем — превью передаёт его.
  fontFamily?: string;
  // Скидка на горящие окошки (src/lib/service-discounts.ts): на картинке —
  // крупный стикер, чтобы её замечали, пока листают сторис.
  discountPercent?: number | null;
  // Фирменный стиль мастера для style: "brand". Без него «Мой стиль»
  // рисуется светлым шаблоном — картинка не должна падать из-за темы.
  brand?: StoryBrand | null;
};

export type StoryBrand = {
  theme: BrandTheme;
  // PNG логотипа: на сервере — data URI (satori не ходит в хранилище сам),
  // в превью — публичный адрес. null — логотипа нет, рисуем знак okno.
  logoSrc: string | null;
  // CSS-семейства шрифтов темы. На сервере — имена, под которыми шрифты
  // отданы satori; в превью — семейства next/font со страницы.
  headingFont: string;
  bodyFont: string;
};

function dayRanges(day: FreeWindowDay, dayCount: number) {
  return day.windows
    .slice(0, maxWindowsPerDay(dayCount))
    .map((window) => formatFreeWindowRanges([window]));
}

function logo(fill: string, stroke: string, size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="${fill}"/><circle cx="256" cy="282" r="68" fill="none" stroke="${stroke}" stroke-width="34"/></svg>`;
}

function arrow(stroke: string) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
}

function ring(style: string) {
  return `<div style="position:absolute;display:flex;border-radius:9999px;${style}"></div>`;
}

function cta(input: StoryInput, colors: { bg: string; text: string; arrowBg: string; arrowFg: string; shadow?: boolean }) {
  return `<div style="display:flex;align-items:center;gap:12px;height:56px;padding:0 12px 0 24px;border-radius:9999px;background:${colors.bg};color:${colors.text};font-size:21px;font-weight:500;${colors.shadow ? "box-shadow:0 24px 80px rgba(35,36,31,0.16);" : ""}">
    <span>${escapeHtml(input.publicLink)}</span>
    <div style="display:flex;width:36px;height:36px;border-radius:9999px;background:${colors.arrowBg};align-items:center;justify-content:center">${arrow(colors.arrowFg)}</div>
  </div>`;
}

// Круглый стикер «−20% на окошки», чуть повёрнутый — как ценник на витрине.
function discountSticker(
  percent: number,
  colors: { bg: string; text: string; ring: string },
  position: string,
) {
  return `<div style="position:absolute;display:flex;${position};width:136px;height:136px;border-radius:9999px;background:${colors.bg};border:4px solid ${colors.ring};flex-direction:column;align-items:center;justify-content:center;transform:rotate(-12deg);box-shadow:0 18px 50px rgba(35,36,31,0.28)">
    <span style="font-size:42px;font-weight:600;line-height:1;letter-spacing:-0.03em;color:${colors.text}">−${percent}%</span>
    <span style="margin-top:5px;font-size:13px;font-weight:600;letter-spacing:0.04em;color:${colors.text}">на окошки</span>
  </div>`;
}

// Стикер скидки висит на правом углу окошек: длинное имя мастера над ним
// переносим на вторую строку, а не прячем под стикер.
function nameWidth(input: StoryInput) {
  return input.discountPercent ? "max-width:280px;" : "";
}

function pill(text: string, t: PaletteTokens, padding: string) {
  return `<div style="display:flex;padding:${padding};border-radius:9999px;background:${t.accentSoft};border:1px solid ${t.pillBorder};color:${t.deep};font-size:17px;font-weight:600">${text}</div>`;
}

function dayHeading(day: FreeWindowDay, t: PaletteTokens, size: number) {
  return `<div style="display:flex;align-items:baseline;gap:5px">
    <span style="font-size:${size}px;font-weight:600">${escapeHtml(day.dayName)}</span>
    <span style="font-size:${size - 2}px;font-weight:400;color:${t.soft}">· ${escapeHtml(day.dateLabel)}</span>
  </div>`;
}


function renderLight(input: StoryInput, t: PaletteTokens) {
  const days = input.days
    .map(
      (day, index) => `<div style="display:flex;flex-direction:column;gap:10px;padding:18px 0;${index === 0 ? "" : `border-top:1px solid ${t.line};`}">
        ${dayHeading(day, t, 16)}
        <div style="display:flex;flex-wrap:wrap;gap:8px">${dayRanges(day, input.days.length).map((range) => pill(range, t, "7px 16px")).join("")}</div>
      </div>`,
    )
    .join("");

  return `<div style="position:relative;display:flex;width:${storyLayout.width}px;height:${storyLayout.height}px;background-color:${t.bg};background-image:radial-gradient(circle at 0% 0%, ${t.glowA}, ${fade(t.glowA)} 55%), radial-gradient(circle at 100% 100%, ${t.glowB}, ${fade(t.glowB)} 55%);font-family:${input.fontFamily ?? "Manrope"};color:${t.ink}">
    ${ring(`right:-150px;top:-110px;width:420px;height:420px;border:44px solid ${t.ring}`)}
    ${ring(`right:-60px;top:-20px;width:240px;height:240px;border:1.5px solid ${t.ringLine}`)}
    ${ring(`left:-120px;bottom:-120px;width:340px;height:340px;border:1.5px solid ${t.ringLine}`)}
    ${ring(`left:-70px;bottom:-70px;width:240px;height:240px;border:1.5px solid ${t.ringLine}`)}
    <div style="position:relative;display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;padding:116px 40px">
      <div style="display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;align-items:center;gap:10px">
          ${logo("#23241f", "#faf7f1", 30)}
          <span style="font-size:22px;font-weight:600;letter-spacing:-0.02em;color:#23241f">okno</span>
        </div>
        <div style="display:flex;align-self:flex-start;align-items:center;gap:8px;padding:6px 14px;border-radius:9999px;background:${t.surface};border:1px solid ${t.line}">
          <div style="display:flex;width:8px;height:8px;border-radius:9999px;background:${t.deep}"></div>
          <span style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:${t.soft}">Горящие окошки</span>
        </div>
        <div style="display:flex;font-size:54px;font-weight:600;line-height:1.04;letter-spacing:-0.025em">Есть свободные окошки</div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="display:flex;width:44px;height:44px;border-radius:9999px;background:${t.avatarBg};color:${t.avatarText};align-items:center;justify-content:center;font-size:16px;font-weight:600">${escapeHtml(masterInitials(input.masterName))}</div>
          <div style="display:flex;flex-direction:column;gap:2px;${nameWidth(input)}">
            <span style="font-size:19px;font-weight:600">${escapeHtml(input.masterName)}</span>
            <span style="font-size:14px;${input.discountPercent ? `font-weight:600;color:${t.deep}` : `color:${t.soft}`}">${input.discountPercent ? `Скидка ${input.discountPercent}% на эти окошки` : "Запишитесь на удобное время"}</span>
          </div>
        </div>
      </div>
      <div style="position:relative;display:flex;flex-direction:column;padding:8px 24px;border-radius:28px;background:${t.surface};border:1px solid ${t.line};box-shadow:0 24px 80px rgba(35,36,31,0.08)">${days}${input.discountPercent ? discountSticker(input.discountPercent, { bg: t.cta, text: t.ctaText, ring: t.bg }, "right:-22px;top:-74px") : ""}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:12px">
        <span style="font-size:13px;font-weight:500;color:${t.soft}">Запись онлайн, без звонков и переписки</span>
        ${cta(input, { bg: t.cta, text: t.ctaText, arrowBg: t.arrowBg, arrowFg: t.arrowFg, shadow: true })}
      </div>
    </div>
  </div>`;
}

function renderArch(input: StoryInput, t: PaletteTokens) {
  const days = input.days
    .map(
      (day) => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 0;border-top:1px solid ${t.line}">
        ${dayHeading(day, t, 15)}
        <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px">${dayRanges(day, input.days.length).map((range) => pill(range, t, "6px 16px")).join("")}</div>
      </div>`,
    )
    .join("");

  return `<div style="position:relative;display:flex;width:${storyLayout.width}px;height:${storyLayout.height}px;background-color:${t.archBg};background-image:radial-gradient(circle at 50% 30%, ${t.archGlow}, ${fade(t.archGlow)} 60%);font-family:${input.fontFamily ?? "Manrope"};color:${t.ink}">
    <div style="position:absolute;display:flex;left:14px;top:96px;width:512px;height:700px;border-radius:256px 256px 40px 40px;border:1.5px solid rgba(35,36,31,0.22)"></div>
    <div style="position:absolute;display:flex;left:-6px;top:84px;width:552px;height:740px;border-radius:276px 276px 44px 44px;border:1.5px solid rgba(35,36,31,0.12)"></div>
    ${ring("right:-70px;bottom:40px;width:200px;height:200px;border:28px solid rgba(250,247,241,0.4)")}
    ${ring("left:-60px;bottom:150px;width:140px;height:140px;border:1.5px solid rgba(35,36,31,0.2)")}
    <div style="position:relative;display:flex;flex-direction:column;justify-content:space-between;align-items:center;width:100%;height:100%;padding:112px 40px">
      ${input.discountPercent ? discountSticker(input.discountPercent, { bg: t.cta, text: t.ctaText, ring: "#faf7f1" }, "right:6px;top:70px") : ""}
      <div style="display:flex;flex-direction:column;align-items:center;gap:22px;width:100%;padding:56px 30px 24px;border-radius:230px 230px 32px 32px;background-color:#faf7f1;background-image:radial-gradient(circle at 50% 0%, rgba(247,226,211,0.95), rgba(247,226,211,0) 60%);box-shadow:0 32px 120px rgba(35,36,31,0.14)">
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
          ${logo("#23241f", "#faf7f1", 34)}
          <span style="font-size:12px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:${t.deep}">Горящие окошки</span>
          <div style="display:flex;font-size:42px;font-weight:600;line-height:1.08;letter-spacing:-0.025em;text-align:center">Есть свободные окошки</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="display:flex;width:32px;height:32px;border-radius:9999px;background:${t.avatarBg};color:${t.avatarText};align-items:center;justify-content:center;font-size:12px;font-weight:600">${escapeHtml(masterInitials(input.masterName))}</div>
            <span style="font-size:18px;font-weight:600;color:${t.soft}">${escapeHtml(input.masterName)}</span>
          </div>
          ${input.discountPercent ? `<div style="display:flex;margin-top:4px;padding:6px 16px;border-radius:9999px;background:${t.cta};color:${t.ctaText};font-size:16px;font-weight:600">Скидка ${input.discountPercent}% на эти окошки</div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;width:100%">${days}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
        <span style="font-size:13px;font-weight:500;color:#23241f">Запись онлайн, без звонков и переписки</span>
        ${cta(input, { bg: t.cta, text: t.ctaText, arrowBg: t.arrowBg, arrowFg: t.arrowFg })}
      </div>
    </div>
  </div>`;
}

function renderInk(input: StoryInput, t: PaletteTokens) {
  const days = input.days
    .map(
      (day, index) => `<div style="display:flex;flex-direction:column;gap:8px;${index === 0 ? "" : "padding-top:22px;border-top:1px solid rgba(242,237,226,0.16);"}">
        <span style="font-size:14px;font-weight:500;color:#cdc6b8">${escapeHtml(day.label)}</span>
        <div style="display:flex;flex-wrap:wrap;gap:4px 22px">${dayRanges(day, input.days.length)
          .map(
            (range) =>
              `<span style="font-size:32px;font-weight:600;letter-spacing:-0.025em;color:${t.inkAccent}">${range}</span>`,
          )
          .join("")}</div>
      </div>`,
    )
    .join("");

  return `<div style="position:relative;display:flex;width:${storyLayout.width}px;height:${storyLayout.height}px;background:radial-gradient(circle at 100% 0%, ${t.inkGlow}, ${fade(t.inkGlow)} 55%), linear-gradient(160deg, ${t.inkBg1} 0%, ${t.inkBg2} 100%);font-family:${input.fontFamily ?? "Manrope"};color:#faf7f1">
    ${ring(`right:-170px;bottom:-60px;width:460px;height:460px;border:50px solid ${t.inkRing}`)}
    ${ring("right:-90px;bottom:20px;width:300px;height:300px;border:1.5px solid rgba(242,237,226,0.12)")}
    ${ring("left:-100px;top:-100px;width:300px;height:300px;border:1.5px solid rgba(242,237,226,0.1)")}
    <div style="position:relative;display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;padding:116px 40px">
      <div style="display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;align-items:center;gap:10px">
          ${logo("#faf7f1", "#23241f", 30)}
          <span style="font-size:22px;font-weight:600;letter-spacing:-0.02em">okno</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
          <div style="display:flex;width:9px;height:9px;border-radius:9999px;background:${t.inkAccent}"></div>
          <span style="font-size:12px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#cdc6b8">Горящие окошки</span>
        </div>
        <div style="display:flex;font-size:54px;font-weight:600;line-height:1.04;letter-spacing:-0.025em">Есть свободные окошки</div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="display:flex;width:44px;height:44px;border-radius:9999px;background:${t.inkAccent};color:${t.inkBg1};align-items:center;justify-content:center;font-size:16px;font-weight:600">${escapeHtml(masterInitials(input.masterName))}</div>
          <div style="display:flex;flex-direction:column;gap:2px;${nameWidth(input)}">
            <span style="font-size:19px;font-weight:600">${escapeHtml(input.masterName)}</span>
            ${input.discountPercent ? `<span style="font-size:14px;font-weight:600;color:${t.inkAccent}">Скидка ${input.discountPercent}% на эти окошки</span>` : ""}
          </div>
        </div>
      </div>
      <div style="position:relative;display:flex;flex-direction:column;gap:22px">${days}${input.discountPercent ? discountSticker(input.discountPercent, { bg: t.inkAccent, text: t.inkBg1, ring: t.inkBg2 }, "right:-18px;top:-84px") : ""}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:12px">
        <span style="font-size:13px;font-weight:500;color:#cdc6b8">Запись онлайн, без звонков и переписки</span>
        ${cta(input, { bg: "#faf7f1", text: "#23241f", arrowBg: t.inkBg1, arrowFg: "#faf7f1" })}
      </div>
    </div>
  </div>`;
}

function hexToRgba(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

const leafPath = "M0 0C6-9 18-9 24 0C18 9 6 9 0 0Z";

// Декор фирменного стиля в углах сторис — те же рисунки, что в шапке
// публичной страницы (components/brand-theme/brand-decor.tsx, BrandHeroDecor),
// только цветами темы напрямую: в satori CSS-переменных нет.
function brandDecorSvg(style: BrandDecorStyle, d1: string, d2: string, opacity: number, transform = "") {
  const svgStyle = `opacity:${opacity};${transform ? `transform:${transform};` : ""}`;
  if (style === "geometric") {
    return `<svg width="300" height="300" viewBox="230 20 150 150" style="${svgStyle}"><g fill="none" stroke="${d1}" stroke-width="1.2"><path d="M250 40h110v110H250z"/><path d="M265 55h80v80h-80z" stroke="${d2}"/><path d="M250 40l110 110M360 40L250 150" opacity=".5"/><path d="M190 200L390 0" opacity=".4"/></g></svg>`;
  }
  if (style === "botanical") {
    const leaves = (fill: string, items: Array<[number, number, number]>) =>
      `<g fill="${fill}">${items.map(([x, y, r]) => `<path d="${leafPath}" transform="translate(${x} ${y}) rotate(${r})"/>`).join("")}</g>`;
    return `<svg width="300" height="300" viewBox="240 40 160 160" style="${svgStyle}"><g fill="none" stroke="${d2}" stroke-width="1.6" stroke-linecap="round"><path d="M300 210C310 160 300 110 332 56"/><path d="M356 210C352 168 372 138 396 104"/><path d="M250 210C262 176 258 150 280 122"/></g>${leaves(d1, [[306, 140, -20], [312, 100, -70], [330, 62, -40], [352, 150, -10]])}${leaves(d2, [[364, 120, -60], [386, 106, -25], [264, 162, -25], [278, 128, -65]])}</svg>`;
  }
  return `<svg width="360" height="180" viewBox="0 0 400 200" style="${svgStyle}"><g fill="none" stroke-linecap="round"><path d="M-20 160C60 110 130 200 210 140S340 60 430 110" stroke="${d1}" stroke-width="34" opacity=".35"/><path d="M-20 70C80 20 150 100 240 50S350 10 430 40" stroke="${d2}" stroke-width="12" opacity=".6"/></g></svg>`;
}

// «Мой стиль»: раскладка светлого шаблона, но всё оформление — из
// фирменной темы мастера: цвета, шрифты, вес и разрядка заголовка,
// скругления, тени, декор и логотип. Читаемость пар «текст на фоне» тема
// уже прошла при генерации (lib/brand-theme/contrast.ts), поэтому здесь
// берём только её же пары: текст на фоне, на карточке, на кнопке.
function renderBrand(input: StoryInput, brand: StoryBrand) {
  const { theme } = brand;
  const c = theme.colors;
  const dark = theme.scheme === "dark";
  const shadowBase = dark ? "#000000" : c.ink;
  const shadowK = theme.shadow === "deep" ? 2 : 1;
  const cardShadow =
    theme.shadow === "none" ? "" : `box-shadow:0 24px 80px ${hexToRgba(shadowBase, 0.08 * shadowK * (dark ? 4 : 1))};`;
  const pillRadius = Math.min(theme.radius.button, 9999);
  const cardRadius = theme.radius.card;
  const decorOpacity = (theme.decorIntensity / 100) * 0.75;
  const showDecor = theme.decor !== "none";
  const heading = `font-family:${brand.headingFont};font-weight:${theme.fonts.headingWeight};letter-spacing:${theme.fonts.headingTracking}em`;

  const days = input.days
    .map(
      (day, index) => `<div style="display:flex;flex-direction:column;gap:10px;padding:18px 0;${index === 0 ? "" : `border-top:1px solid ${c.line};`}">
        <div style="display:flex;align-items:baseline;gap:5px">
          <span style="font-size:16px;font-weight:600;color:${c.ink}">${escapeHtml(day.dayName)}</span>
          <span style="font-size:14px;font-weight:400;color:${c.inkSoft}">· ${escapeHtml(day.dateLabel)}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${dayRanges(day, input.days.length)
          .map(
            (range) =>
              `<div style="display:flex;padding:7px 16px;border-radius:${pillRadius}px;background:${c.accentSoft};border:1px solid ${c.accent};color:${c.accentDeep};font-size:17px;font-weight:600">${range}</div>`,
          )
          .join("")}</div>
      </div>`,
    )
    .join("");

  const mark = brand.logoSrc
    ? `<img src="${brand.logoSrc}" style="height:44px;max-width:200px;object-fit:contain;object-position:left center" />`
    : `<div style="display:flex;align-items:center;gap:10px">${logo(c.ink, c.background, 30)}<span style="font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${c.ink}">okno</span></div>`;

  return `<div style="position:relative;display:flex;width:${storyLayout.width}px;height:${storyLayout.height}px;background-color:${c.background};background-image:radial-gradient(circle at 0% 0%, ${hexToRgba(c.accent, 0.35)}, ${hexToRgba(c.accent, 0)} 55%), radial-gradient(circle at 100% 100%, ${hexToRgba(c.accentSoft, 0.9)}, ${hexToRgba(c.accentSoft, 0)} 55%);font-family:${brand.bodyFont};color:${c.ink}">
    ${showDecor && theme.decorSlots.hero ? `<div style="position:absolute;display:flex;right:-20px;top:40px">${brandDecorSvg(theme.decor, c.decor1, c.decor2, decorOpacity)}</div>` : ""}
    ${showDecor && theme.decorSlots.footer ? `<div style="position:absolute;display:flex;left:-30px;bottom:30px">${brandDecorSvg(theme.decor, c.decor1, c.decor2, decorOpacity, "rotate(180deg)")}</div>` : ""}
    <div style="position:relative;display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;padding:116px 40px">
      <div style="display:flex;flex-direction:column;gap:18px">
        ${mark}
        <div style="display:flex;align-self:flex-start;align-items:center;gap:8px;padding:6px 14px;border-radius:${pillRadius}px;background:${c.card};border:1px solid ${c.line}">
          <div style="display:flex;width:8px;height:8px;border-radius:9999px;background:${c.accentDeep}"></div>
          <span style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:${c.inkSoft}">Горящие окошки</span>
        </div>
        <div style="display:flex;font-size:54px;line-height:1.06;${heading}">Есть свободные окошки</div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="display:flex;width:44px;height:44px;border-radius:9999px;background:${c.button};color:${c.buttonText};align-items:center;justify-content:center;font-size:16px;font-weight:600">${escapeHtml(masterInitials(input.masterName))}</div>
          <div style="display:flex;flex-direction:column;gap:2px;${nameWidth(input)}">
            <span style="font-size:19px;font-weight:600;${heading.replace(/font-weight:\d+;/, "")}">${escapeHtml(input.masterName)}</span>
            <span style="font-size:14px;${input.discountPercent ? `font-weight:600;color:${c.accentDeep}` : `color:${c.inkSoft}`}">${input.discountPercent ? `Скидка ${input.discountPercent}% на эти окошки` : "Запишитесь на удобное время"}</span>
          </div>
        </div>
      </div>
      <div style="position:relative;display:flex;flex-direction:column;padding:8px 24px;border-radius:${cardRadius}px;background:${c.card};border:1px solid ${c.line};${cardShadow}">${days}${input.discountPercent ? discountSticker(input.discountPercent, { bg: c.button, text: c.buttonText, ring: c.background }, "right:-22px;top:-74px") : ""}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:12px">
        <span style="font-size:13px;font-weight:500;color:${c.inkSoft}">Запись онлайн, без звонков и переписки</span>
        <div style="display:flex;align-items:center;gap:12px;height:56px;padding:0 12px 0 24px;border-radius:${pillRadius}px;background:${c.button};color:${c.buttonText};font-size:21px;font-weight:500;${cardShadow}">
          <span>${escapeHtml(input.publicLink)}</span>
          <div style="display:flex;width:36px;height:36px;border-radius:${Math.min(pillRadius, 18)}px;background:${c.buttonText};align-items:center;justify-content:center">${arrow(c.button)}</div>
        </div>
      </div>
    </div>
  </div>`;
}

export function buildFreeWindowsStoryHtml(input: StoryInput) {
  if (input.style === "brand" && input.brand) return renderBrand(input, input.brand);
  const tokens = storyPaletteTokens[input.palette];
  if (input.style === "arch") return renderArch(input, tokens);
  if (input.style === "ink") return renderInk(input, tokens);
  return renderLight(input, tokens);
}
