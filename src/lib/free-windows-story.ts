import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { html as parseHtml } from "satori-html";
import {
  getBookingThemePreset,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";
import { loadFonts } from "@/lib/certificates/render";
import type { FreeWindowDay } from "@/lib/free-windows";

// Картинка «Горящие окошки» для сторис (документы/горящие-окошки.md).
// Тот же стек, что у сертификатов: satori → SVG → resvg → PNG, без браузера.
// Цвета берём из светлой темы страницы мастера, чтобы сторис и страница
// записи, на которую она ведёт, выглядели одним целым. Большие отступы сверху
// и снизу — безопасная зона: Instagram и VK накрывают края сторис кнопками.

export const storyDimensions = { width: 1080, height: 1920 } as const;

// Больше в кадр не помещается без мелкого шрифта, а мелкий в сторис не
// читают: при трёх днях — по одному ряду (два окошка) на день, при одном-двух
// — по два ряда. Остальное клиент увидит на странице записи.
function maxWindowsPerDay(dayCount: number) {
  return dayCount >= 3 ? 2 : 4;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildFreeWindowsStoryHtml(input: {
  days: FreeWindowDay[];
  masterName: string;
  publicLink: string;
  themePresetId: BookingThemePresetId;
}) {
  const theme = getBookingThemePreset(input.themePresetId).light;
  const background = theme["--color-background"];
  const ink = theme["--color-ink"];
  const muted = theme["--color-muted"];
  const card = theme["--ui-card-bg"];
  const line = theme["--color-line"];
  const pill = theme["--color-panel"];
  const accentDeep = theme["--color-accent-deep"];
  const primaryBg = theme["--ui-primary-bg"];
  const primaryText = theme["--ui-primary-text"];

  const daysHtml = input.days
    .map((day) => {
      const shown = day.windows.slice(0, maxWindowsPerDay(input.days.length));
      const hidden = day.windows.length - shown.length;
      const pills = shown
        .map(
          (window) =>
            `<div style="display:flex;padding:16px 30px;border-radius:999px;background:${pill};font-size:46px;font-weight:700;color:${ink};">${window.start}–${window.end}</div>`,
        )
        .join("");
      const more =
        hidden > 0
          ? `<div style="display:flex;padding:16px 8px;font-size:36px;color:${muted};">и ещё ${hidden}</div>`
          : "";

      return `<div style="display:flex;flex-direction:column;gap:24px;padding:36px 44px;border-radius:44px;background:${card};border:2px solid ${line};">
        <div style="display:flex;font-size:40px;font-weight:700;color:${accentDeep};">${escapeHtml(day.label)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;">${pills}${more}</div>
      </div>`;
    })
    .join("");

  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:${storyDimensions.width}px;height:${storyDimensions.height}px;padding:200px 88px 220px;background:${background};font-family:'PT Sans';color:${ink};">
    <div style="display:flex;flex-direction:column;gap:48px;">
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;font-size:34px;letter-spacing:6px;color:${muted};">ОНЛАЙН-ЗАПИСЬ</div>
        <div style="display:flex;font-size:104px;font-weight:700;line-height:1.02;">Свободные окошки</div>
        <div style="display:flex;font-size:44px;color:${muted};">${escapeHtml(input.masterName)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:24px;">${daysHtml}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:24px;">
      <div style="display:flex;font-size:40px;color:${muted};">Записаться онлайн</div>
      <div style="display:flex;padding:28px 52px;border-radius:999px;background:${primaryBg};color:${primaryText};font-size:48px;font-weight:700;">${escapeHtml(input.publicLink)}</div>
    </div>
  </div>`;
}

export async function renderFreeWindowsStoryPng(
  input: Parameters<typeof buildFreeWindowsStoryHtml>[0],
) {
  const tree = parseHtml(buildFreeWindowsStoryHtml(input));
  // satori-html отдаёт свой VNode — структурно то, что ждёт satori, но типы
  // пакетов не совпадают (тот же приём, что в certificates/render.ts).
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: storyDimensions.width,
    height: storyDimensions.height,
    fonts: loadFonts(),
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: storyDimensions.width },
  });
  return Buffer.from(resvg.render().asPng());
}
