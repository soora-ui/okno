import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { fixBrandThemeContrast, type ContrastFix } from "@/lib/brand-theme/contrast";
import {
  brandThemeSystemPrompt,
  buildBrandThemeBriefText,
  generatedPalettesSchema,
  normalizeGeneratedTheme,
  normalizeHexList,
  type BrandThemeBrief,
} from "@/lib/brand-theme/generation-prompt";
import { brandMaterialsToContent, type BrandMaterial } from "@/lib/brand-theme/materials";
import type { BrandFontId, BrandTheme } from "@/lib/brand-theme/schema";
import { env } from "@/lib/env";

// Генерация трёх вариантов фирменного стиля через Claude API. Одна
// попытка — один запрос: материалы + текст мастера → три темы. Каждая
// тема проходит строгую схему и проверку контраста, прежде чем попасть
// к мастеру.

export const brandThemeModel = "claude-opus-5-5";

export type BrandThemeVariant = {
  name: string;
  explanation: string;
  theme: BrandTheme;
  contrastFixes: ContrastFix[];
};

export type BrandThemeGeneration = {
  foundColors: string[];
  foundFonts: string[];
  fontNote: { sourceFont: string; replacement: BrandFontId; reason: string } | null;
  variants: BrandThemeVariant[];
};

export class BrandThemeGenerationError extends Error {}

let client: Anthropic | null = null;

function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export async function generateBrandThemeVariants(input: {
  brief: BrandThemeBrief;
  materials: BrandMaterial[];
}): Promise<BrandThemeGeneration> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...brandMaterialsToContent(input.materials),
    { type: "text", text: buildBrandThemeBriefText(input.brief) },
  ];

  const response = await getClient().beta.messages.parse(
    {
      model: brandThemeModel,
      max_tokens: 16000,
      // Подбор палитры — задача на вкус, а не на долгие рассуждения:
      // medium держит ответ в пределах 10–40 секунд из ТЗ.
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(generatedPalettesSchema),
      },
      // Если классификатор безопасности отклонит запрос (например, на
      // фото из брендбука), тот же запрос выполнит запасная модель.
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      system: brandThemeSystemPrompt,
      messages: [{ role: "user", content }],
    },
    { timeout: 120_000 },
  );

  if (response.stop_reason === "refusal") {
    throw new BrandThemeGenerationError(
      "Не получилось разобрать материалы. Попробуйте другие файлы или опишите стиль словами.",
    );
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new BrandThemeGenerationError("Ответ получился неполным. Попробуйте ещё раз.");
  }

  const output = response.parsed_output;
  const variants = output.variants
    .map((variant) => {
      const theme = normalizeGeneratedTheme(variant);
      if (!theme) return null;
      const fixed = fixBrandThemeContrast(theme);
      return {
        name: variant.name.trim().slice(0, 60),
        explanation: variant.explanation.trim().slice(0, 240),
        theme: fixed.theme,
        contrastFixes: fixed.fixes,
      };
    })
    .filter((variant): variant is BrandThemeVariant => variant !== null)
    .slice(0, 3);

  if (variants.length === 0) {
    throw new BrandThemeGenerationError("Не получилось собрать варианты. Попробуйте ещё раз.");
  }

  return {
    foundColors: normalizeHexList(output.foundColors).slice(0, 12),
    foundFonts: output.foundFonts.map((font) => font.trim().slice(0, 60)).filter(Boolean).slice(0, 6),
    fontNote: output.fontNote
      ? {
          sourceFont: output.fontNote.sourceFont.trim().slice(0, 60),
          replacement: output.fontNote.replacement,
          reason: output.fontNote.reason.trim().slice(0, 200),
        }
      : null,
    variants,
  };
}
