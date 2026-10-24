import type Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";

// Материалы мастера для генерации (ТЗ 4.3–4.5): брендбук, логотип,
// примеры оформления, фото с цветами. Файлы не хранятся — уходят в Claude
// одним запросом и забываются; в brand_themes.source остаётся только то,
// что мастер написал словами.

export const brandMaterialKinds = ["brandbook", "logo", "example", "colorPhoto"] as const;

export type BrandMaterialKind = (typeof brandMaterialKinds)[number];

export const brandMaterialLimits: Record<BrandMaterialKind, number> = {
  brandbook: 3,
  logo: 1,
  example: 10,
  colorPhoto: 5,
};

// Изображение в API — до 5 МБ в base64, то есть около 3,7 МБ исходника.
// Клиент заранее ужимает фото, сюда большие приходят только в обход него.
export const maxImageBytes = 3_500_000;
export const maxPdfBytes = 20_000_000;
// Весь запрос к API — до 32 МБ, base64 раздувает на треть.
export const maxTotalBytes = 22_000_000;
// Из брендбука хватает первых страниц: палитра, логотип и шрифты почти
// всегда в начале, а остальное — правила применения и макеты.
export const maxPdfPages = 15;

type MaterialType = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "application/pdf";

export type BrandMaterial = {
  kind: BrandMaterialKind;
  name: string;
  type: MaterialType;
  bytes: Uint8Array;
};

export class BrandMaterialError extends Error {}

// Тип определяем по сигнатуре, а не по тому, что прислал браузер.
function sniff(bytes: Uint8Array): MaterialType | null {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  return null;
}

const kindLabel: Record<BrandMaterialKind, string> = {
  brandbook: "брендбук",
  logo: "логотип",
  example: "пример оформления",
  colorPhoto: "фото с цветами",
};

export async function readBrandMaterials(
  entries: { kind: BrandMaterialKind; file: File }[],
): Promise<BrandMaterial[]> {
  const counts: Record<BrandMaterialKind, number> = { brandbook: 0, logo: 0, example: 0, colorPhoto: 0 };
  let total = 0;
  const materials: BrandMaterial[] = [];

  for (const { kind, file } of entries) {
    counts[kind] += 1;
    if (counts[kind] > brandMaterialLimits[kind]) {
      throw new BrandMaterialError(
        `Слишком много файлов: ${kindLabel[kind]} — не больше ${brandMaterialLimits[kind]}.`,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniff(bytes);
    if (!type || (type === "application/pdf" && kind !== "brandbook")) {
      throw new BrandMaterialError(
        `«${file.name}»: подходят PNG, JPG, WEBP${kind === "brandbook" ? " и PDF" : ""}.`,
      );
    }

    const limit = type === "application/pdf" ? maxPdfBytes : maxImageBytes;
    if (bytes.byteLength > limit) {
      throw new BrandMaterialError(
        `«${file.name}» слишком большой: до ${Math.round(limit / 1_000_000)} МБ.`,
      );
    }

    const prepared = type === "application/pdf" ? await firstPdfPages(bytes, file.name) : bytes;
    total += prepared.byteLength;
    if (total > maxTotalBytes) {
      throw new BrandMaterialError("Материалов слишком много за раз: оставьте самые важные.");
    }

    materials.push({ kind, name: file.name, type, bytes: prepared });
  }

  return materials;
}

async function firstPdfPages(bytes: Uint8Array, name: string): Promise<Uint8Array> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new BrandMaterialError(`«${name}» не открылся. Возможно, он защищён паролем.`);
  }

  if (source.getPageCount() <= maxPdfPages) return bytes;

  const trimmed = await PDFDocument.create();
  const pages = await trimmed.copyPages(
    source,
    Array.from({ length: maxPdfPages }, (_, index) => index),
  );
  pages.forEach((page) => trimmed.addPage(page));
  return trimmed.save();
}

const groupTitle: Record<BrandMaterialKind, string> = {
  brandbook: "Брендбук мастера:",
  logo: "Логотип:",
  example: "Как бренд уже выглядит у мастера (канал, бот, соцсети, вывеска):",
  colorPhoto: "Фото, на которых видны цвета бренда:",
};

/** Материалы → блоки сообщения: документы и картинки, сгруппированные с подписью. */
export function brandMaterialsToContent(
  materials: BrandMaterial[],
): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];

  for (const kind of brandMaterialKinds) {
    const group = materials.filter((material) => material.kind === kind);
    if (group.length === 0) continue;

    blocks.push({ type: "text", text: groupTitle[kind] });
    for (const material of group) {
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
