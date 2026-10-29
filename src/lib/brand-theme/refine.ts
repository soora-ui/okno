import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { fixBrandThemeContrast, type ContrastFix } from "@/lib/brand-theme/contrast";
import { brandThemeModel } from "@/lib/brand-theme/generate";
import {
  brandThemeSystemPrompt,
  generatedVariantSchema,
  normalizeGeneratedTheme,
} from "@/lib/brand-theme/generation-prompt";
import type { BrandTheme } from "@/lib/brand-theme/schema";
import { env } from "@/lib/env";

// «Поправить» (макет 4.11): точечная правка выбранного варианта по быстрым
// чипам и комментарию. Генерацию не тратит; модель получает текущую тему
// целиком и меняет только то, о чём просили.

export const brandRefineChips = [
  "Темнее",
  "Светлее",
  "Меньше декора",
  "Больше декора",
  "Другой шрифт заголовков",
  "Кнопка ярче",
  "Убрать узоры",
] as const;

export type BrandRefineChip = (typeof brandRefineChips)[number];

// «Выбрать элемент на странице»: правка привязывается к месту.
export const brandRefineTargets = {
  cta: "Кнопка «Записаться»",
  hero: "Шапка страницы",
  headings: "Заголовки",
  cards: "Карточки услуг",
  background: "Фон страницы",
  decor: "Декор",
} as const;

export type BrandRefineTarget = keyof typeof brandRefineTargets;

const refinedThemeSchema = generatedVariantSchema.extend({
  decorIntensity: z.number().int().describe("Интенсивность декора, 10–100"),
  decorSlots: z.object({
    hero: z.boolean(),
    avatar: z.boolean(),
    dividers: z.boolean(),
    cards: z.boolean(),
    cta: z.boolean(),
    footer: z.boolean(),
  }),
});

let client: Anthropic | null = null;

function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export class BrandRefineError extends Error {}

function themeForPrompt(theme: BrandTheme) {
  // Логотип модели не нужен: он не меняется и подставляется обратно.
  const rest: Partial<BrandTheme> = { ...theme };
  delete rest.logo;
  return rest;
}

export async function refineBrandTheme(input: {
  theme: BrandTheme;
  chips: BrandRefineChip[];
  comment: string;
  target: BrandRefineTarget | null;
}): Promise<{ theme: BrandTheme; contrastFixes: ContrastFix[]; name: string; explanation: string }> {
  const request = [
    `Текущая тема мастера (JSON):\n${JSON.stringify(themeForPrompt(input.theme))}`,
    input.chips.length > 0 ? `Быстрые правки: ${input.chips.join(", ")}.` : null,
    input.target ? `Правка относится к элементу: ${brandRefineTargets[input.target]}.` : null,
    input.comment.trim() ? `Мастер пишет: «${input.comment.trim()}».` : null,
    "Верни ту же тему с этими изменениями. Всё, о чём мастер не просил, оставь как было: те же цвета, шрифты, скругления и декор. Это правка, а не новый вариант. «Меньше/больше декора» — это decorIntensity и decorSlots; «Убрать узоры» — выключи фоновые слоты hero и footer. В name напиши, что изменилось (2–4 слова), в explanation — одно предложение.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await getClient().beta.messages.parse(
    {
      model: brandThemeModel,
      max_tokens: 6000,
      output_config: { effort: "low", format: betaZodOutputFormat(refinedThemeSchema) },
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      system: brandThemeSystemPrompt,
      messages: [{ role: "user", content: request }],
    },
    { timeout: 90_000 },
  );

  const output = response.parsed_output;
  if (response.stop_reason === "refusal" || !output) {
    throw new BrandRefineError("Не получилось внести правку. Попробуйте сформулировать иначе.");
  }

  const base = normalizeGeneratedTheme(output);
  if (!base) {
    throw new BrandRefineError("Не получилось внести правку. Попробуйте ещё раз.");
  }

  const fixed = fixBrandThemeContrast({
    ...base,
    decorSlots: output.decorSlots,
    decorIntensity: Math.min(Math.max(Math.round(output.decorIntensity), 10), 100),
    logo: input.theme.logo,
  });
  return {
    theme: fixed.theme,
    contrastFixes: fixed.fixes,
    name: output.name.trim().slice(0, 60),
    explanation: output.explanation.trim().slice(0, 240),
  };
}
