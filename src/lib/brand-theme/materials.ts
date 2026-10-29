import type Anthropic from "@anthropic-ai/sdk";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";

// Материалы мастера (макеты 4.3–4.5): брендбук, логотип, примеры
// оформления, фото с цветами. Загружаются по одному в приватный бакет
// brand-materials (storage.ts) и оттуда идут в разбор и генерацию —
// «Сгенерировать заново» работает с теми же файлами.

export const brandMaterialKinds = ["brandbook", "logo", "example", "colorPhoto"] as const;

export type BrandMaterialKind = (typeof brandMaterialKinds)[number];

// Лимиты из макетов. Логотипов два: основной и светлая версия для тёмной
// темы (4.5, «Загрузить светлую версию»).
export const brandMaterialLimits: Record<BrandMaterialKind, number> = {
  brandbook: 3,
  logo: 2,
  example: 10,
  colorPhoto: 5,
};

// Изображение в API — до 5 МБ в base64, то есть около 3,7 МБ исходника.
// Клиент заранее ужимает фото; сюда большие приходят только в обход него.
export const maxImageBytes = 3_500_000;
export const maxPdfBytes = 20_000_000;
export const maxSvgBytes = 500_000;
// Весь запрос к API — до 32 МБ, base64 раздувает на треть.
export const maxTotalBytes = 22_000_000;
// Из брендбука хватает первых страниц: палитра, логотип и шрифты почти
// всегда в начале, а остальное — правила применения и макеты.
export const maxPdfPages = 15;

export type BrandMaterialType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

export type BrandMaterial = {
  kind: BrandMaterialKind;
  name: string;
  type: BrandMaterialType;
  bytes: Uint8Array;
  pageCount: number | null;
};

export class BrandMaterialError extends Error {}

// Тип определяем по сигнатуре, а не по тому, что прислал браузер.
function sniff(bytes: Uint8Array): BrandMaterialType | "image/svg+xml" | null {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf";

  const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return "image/svg+xml";
  }
  return null;
}

const kindLabel: Record<BrandMaterialKind, string> = {
  brandbook: "брендбук",
  logo: "логотип",
  example: "пример оформления",
  colorPhoto: "фото с цветами",
};

/**
 * Проверяет и готовит один файл: тип по сигнатуре, размер, PDF — первые
 * 15 страниц, SVG-логотип — сразу в PNG. Исходный SVG дальше не идёт ни в
 * хранилище, ни на страницу: в нём мог быть скрипт или внешняя ссылка,
 * а растр через resvg — просто картинка.
 */
export async function prepareBrandMaterial(
  kind: BrandMaterialKind,
  file: File,
): Promise<BrandMaterial> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  // Логотип — только SVG или PNG (макет 4.5): ему нужна прозрачность, и
  // на страницу он уходит как PNG.
  const allowed =
    type !== null &&
    (type !== "application/pdf" || kind === "brandbook") &&
    (type !== "image/svg+xml" || kind === "logo") &&
    (kind !== "logo" || type === "image/png" || type === "image/svg+xml");

  if (!allowed) {
    throw new BrandMaterialError(
      kind === "brandbook"
        ? "Такой формат не подходит. Загрузите PDF, PNG или JPG."
        : kind === "logo"
          ? "Такой формат не подходит. Загрузите SVG или PNG."
          : "Такой формат не подходит. Загрузите PNG или JPG.",
    );
  }

  if (type === "image/svg+xml") {
    if (bytes.byteLength > maxSvgBytes) {
      throw new BrandMaterialError("Логотип слишком большой: SVG до 500 КБ.");
    }
    return { kind, name: file.name, type: "image/png", bytes: rasterizeSvg(bytes), pageCount: null };
  }

  const limit = type === "application/pdf" ? maxPdfBytes : maxImageBytes;
  if (bytes.byteLength > limit) {
    throw new BrandMaterialError(
      type === "application/pdf"
        ? "Файл больше 20 МБ. Сожмите его или выберите нужные страницы."
        : `«${file.name}» слишком большой для ${kindLabel[kind] === "логотип" ? "логотипа" : "картинки"}: до 3,5 МБ.`,
    );
  }

  if (type === "application/pdf") {
    const pdf = await firstPdfPages(bytes);
    return { kind, name: file.name, type, bytes: pdf.bytes, pageCount: pdf.pageCount };
  }

  return { kind, name: file.name, type, bytes, pageCount: null };
}

function rasterizeSvg(bytes: Uint8Array): Uint8Array {
  try {
    const resvg = new Resvg(Buffer.from(bytes), {
      fitTo: { mode: "width", value: 800 },
      // Не у всех логотипов надпись переведена в кривые: без системных
      // шрифтов такой текст при растеризации просто пропадёт.
      font: { loadSystemFonts: true },
    });
    return new Uint8Array(resvg.render().asPng());
  } catch {
    throw new BrandMaterialError("Не получилось прочитать SVG. Загрузите логотип в PNG.");
  }
}

async function firstPdfPages(bytes: Uint8Array): Promise<{ bytes: Uint8Array; pageCount: number }> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes);
  } catch {
    throw new BrandMaterialError("PDF не открылся. Возможно, он защищён паролем.");
  }

  const total = source.getPageCount();
  if (total <= maxPdfPages) return { bytes, pageCount: total };

  const trimmed = await PDFDocument.create();
  const pages = await trimmed.copyPages(
    source,
    Array.from({ length: maxPdfPages }, (_, index) => index),
  );
  pages.forEach((page) => trimmed.addPage(page));
  return { bytes: await trimmed.save(), pageCount: maxPdfPages };
}

const groupTitle: Record<BrandMaterialKind, string> = {
  brandbook: "Брендбук мастера:",
  logo: "Логотип:",
  example: "Как бренд уже выглядит у мастера (канал, бот, соцсети, вывеска):",
  colorPhoto: "Фото, на которых видны цвета бренда:",
};

/**
 * Материалы → блоки сообщения, сгруппированные с подписью. Перед каждым
 * файлом — его номер: по нему разбор возвращает решение модерации.
 */
export function brandMaterialsToContent(
  materials: BrandMaterial[],
  options: { numbered?: boolean } = {},
): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];

  for (const kind of brandMaterialKinds) {
    const group = materials
      .map((material, index) => ({ material, index }))
      .filter(({ material }) => material.kind === kind);
    if (group.length === 0) continue;

    blocks.push({ type: "text", text: groupTitle[kind] });
    for (const { material, index } of group) {
      if (options.numbered) {
        blocks.push({ type: "text", text: `Файл №${index + 1}:` });
      }
      const data = Buffer.from(material.bytes).toString("base64");
      if (material.type === "application/pdf") {
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        });
      } else {
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: material.type, data },
        });
      }
    }
  }

  return blocks;
}

export function totalMaterialBytes(materials: BrandMaterial[]) {
  return materials.reduce((sum, material) => sum + material.bytes.byteLength, 0);
}
