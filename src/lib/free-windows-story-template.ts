import { formatFreeWindowRanges, type FreeWindowDay } from "@/lib/free-windows";
import type { StoryPalette, StoryStyle } from "@/lib/free-windows-story-options";

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
          <div style="display:flex;flex-direction:column;gap:2px">
            <span style="font-size:19px;font-weight:600">${escapeHtml(input.masterName)}</span>
            <span style="font-size:14px;color:${t.soft}">Запишитесь на удобное время</span>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;padding:8px 24px;border-radius:28px;background:${t.surface};border:1px solid ${t.line};box-shadow:0 24px 80px rgba(35,36,31,0.08)">${days}</div>
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
      <div style="display:flex;flex-direction:column;align-items:center;gap:22px;width:100%;padding:56px 30px 24px;border-radius:230px 230px 32px 32px;background-color:#faf7f1;background-image:radial-gradient(circle at 50% 0%, rgba(247,226,211,0.95), rgba(247,226,211,0) 60%);box-shadow:0 32px 120px rgba(35,36,31,0.14)">
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
          ${logo("#23241f", "#faf7f1", 34)}
          <span style="font-size:12px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:${t.deep}">Горящие окошки</span>
          <div style="display:flex;font-size:42px;font-weight:600;line-height:1.08;letter-spacing:-0.025em;text-align:center">Есть свободные окошки</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="display:flex;width:32px;height:32px;border-radius:9999px;background:${t.avatarBg};color:${t.avatarText};align-items:center;justify-content:center;font-size:12px;font-weight:600">${escapeHtml(masterInitials(input.masterName))}</div>
            <span style="font-size:18px;font-weight:600;color:${t.soft}">${escapeHtml(input.masterName)}</span>
          </div>
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
          <span style="font-size:19px;font-weight:600">${escapeHtml(input.masterName)}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:22px">${days}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:12px">
        <span style="font-size:13px;font-weight:500;color:#cdc6b8">Запись онлайн, без звонков и переписки</span>
        ${cta(input, { bg: "#faf7f1", text: "#23241f", arrowBg: t.inkBg1, arrowFg: "#faf7f1" })}
      </div>
    </div>
  </div>`;
}

export function buildFreeWindowsStoryHtml(input: StoryInput) {
  const tokens = storyPaletteTokens[input.palette];
  if (input.style === "arch") return renderArch(input, tokens);
  if (input.style === "ink") return renderInk(input, tokens);
  return renderLight(input, tokens);
}
