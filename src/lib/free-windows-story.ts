import { readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { html as parseHtml } from "satori-html";
import {
  buildFreeWindowsStoryHtml,
  storyDimensions,
  storyLayout,
  type StoryInput,
} from "@/lib/free-windows-story-template";

export {
  buildFreeWindowsStoryHtml,
  masterInitials,
  storyDimensions,
  storyPaletteTokens,
} from "@/lib/free-windows-story-template";

// Картинка «Горящие окошки» для сторис (документы/горящие-окошки.md). Шаблон —
// в free-windows-story-template.ts; resvg растягивает векторный результат
// 540×960 до 1080×1920 — без потери резкости.
// Стек тот же, что у сертификатов: satori → SVG → resvg → PNG, без браузера.
// У корневого блока нет overflow:hidden, хотя декоративные кольца вылезают за
// край: холст и так обрезает их, а клип от overflow вместе с тенью (box-shadow
// у карточки и кнопки) роняет resvg паникой — падает весь процесс Node.

const fontsDir = path.join(process.cwd(), "src/lib/free-windows-story-fonts");

let cachedFonts: { name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" }[] | null =
  null;

function loadStoryFonts() {
  cachedFonts ??= (
    [
      ["Manrope-Regular.ttf", 400],
      ["Manrope-Medium.ttf", 500],
      ["Manrope-SemiBold.ttf", 600],
    ] as const
  ).map(([file, weight]) => ({
    name: "Manrope",
    data: readFileSync(path.join(fontsDir, file)),
    weight,
    style: "normal" as const,
  }));
  return cachedFonts;
}

export async function renderFreeWindowsStoryPng(input: StoryInput) {
  const tree = parseHtml(buildFreeWindowsStoryHtml(input));
  // satori-html отдаёт свой VNode — структурно то, что ждёт satori, но типы
  // пакетов не совпадают (тот же приём, что в certificates/render.ts).
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: storyLayout.width,
    height: storyLayout.height,
    fonts: loadStoryFonts(),
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: storyDimensions.width },
  });
  return Buffer.from(resvg.render().asPng());
}
