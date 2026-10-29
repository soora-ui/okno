import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { brandThemeModel } from "@/lib/brand-theme/generate";
import { normalizeHexList } from "@/lib/brand-theme/generation-prompt";
import { brandMaterialsToContent, type BrandMaterial } from "@/lib/brand-theme/materials";
import { brandFontIds, type BrandFontId } from "@/lib/brand-theme/schema";
import { env } from "@/lib/env";

// Разбор материалов (макет 4.3, «Что мы нашли»): быстрый запрос до
// генерации — цвета и шрифты из брендбука, которые мастер может поправить,
// и модерация каждого файла (4.16, «Загрузка не прошла проверку»).
// Генерацию не тратит.

const analysisSchema = z.object({
  readable: z
    .boolean()
    .describe("false, если в материалах не удалось разглядеть ни цвета, ни шрифты (плохой скан, пустой файл)"),
  foundColors: z
    .array(z.string())
    .describe("Цвета бренда #rrggbb по убыванию важности, не больше восьми"),
  fonts: z
    .array(
      z.object({
        name: z.string().describe("Как шрифт называется в материалах"),
        role: z.enum(["heading", "body", "unknown"]),
        available: z.enum(brandFontIds).nullable().describe("id, если этот же шрифт есть в списке доступных"),
        replacement: z
          .enum(brandFontIds)
          .nullable()
          .describe("Ближайший по характеру доступный шрифт, если самого шрифта в списке нет"),
      }),
    )
    .describe("Шрифты, которые ты узнал; пустой список, если не узнал"),
  files: z
    .array(
      z.object({
        number: z.number().int().describe("Номер файла из подписи «Файл №N»"),
        verdict: z.enum(["ok", "rejected"]),
        reason: z.string().describe("Для rejected — коротко и вежливо, по-русски; для ok — пустая строка"),
      }),
    )
    .describe("Решение по каждому файлу"),
});

const analysisSystemPrompt = `Ты разбираешь материалы бренда бьюти-мастера перед тем, как по ним соберут оформление его страницы записи.

Найди в материалах фирменные цвета (#rrggbb) и шрифты. Цвета бери с логотипа, палитры брендбука, вывески, упаковки — не с фотографий людей и не с фона снимков. Шрифты называй так, как они называются (Gilroy, Montserrat), а не описанием.

Доступные на сайте шрифты, все с кириллицей: manrope, inter, montserrat, nunito, jost, rubik — гротески; cormorant-garamond, playfair-display, lora, pt-serif — антиквы; unbounded, comfortaa — акцидентные; caveat — рукописный. Если узнанный шрифт есть в этом списке — заполни available. Если нет — подбери ближайший по характеру в replacement.

Проверь каждый файл. rejected — только если файл явно недопустим на странице сервиса: откровенный или сексуальный контент, насилие, символика ненависти, чужие документы и персональные данные (паспорт, банковская карта). Фото работ мастера, интерьер, люди в обычной одежде, скриншоты соцсетей — это ok. Причину отказа пиши одной вежливой фразой без подробностей.`;

export type BrandFontFinding = {
  name: string;
  role: "heading" | "body" | "unknown";
  available: BrandFontId | null;
  replacement: BrandFontId | null;
};

export type BrandMaterialsAnalysis = {
  readable: boolean;
  foundColors: string[];
  fonts: BrandFontFinding[];
  verdicts: { index: number; verdict: "ok" | "rejected"; reason: string }[];
};

export class BrandAnalysisError extends Error {}

let client: Anthropic | null = null;

function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export async function analyzeBrandMaterials(
  materials: BrandMaterial[],
): Promise<BrandMaterialsAnalysis> {
  const response = await getClient().beta.messages.parse(
    {
      model: brandThemeModel,
      max_tokens: 4000,
      // Разбор — извлечение, а не творчество: low держит его в секундах.
      output_config: { effort: "low", format: betaZodOutputFormat(analysisSchema) },
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      system: analysisSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            ...brandMaterialsToContent(materials, { numbered: true }),
            { type: "text", text: "Разбери материалы выше." },
          ],
        },
      ],
    },
    { timeout: 90_000 },
  );

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new BrandAnalysisError("Не получилось разобрать файлы. Укажите цвета вручную или загрузите другой файл.");
  }

  const output = response.parsed_output;
  return {
    readable: output.readable,
    foundColors: normalizeHexList(output.foundColors).slice(0, 8),
    fonts: output.fonts.slice(0, 4).map((font) => ({
      name: font.name.trim().slice(0, 60),
      role: font.role,
      available: font.available,
      replacement: font.available ? null : font.replacement,
    })),
    verdicts: output.files
      .filter((file) => file.number >= 1 && file.number <= materials.length)
      .map((file) => ({
        index: file.number - 1,
        verdict: file.verdict,
        reason: file.reason.trim().slice(0, 200),
      })),
  };
}
