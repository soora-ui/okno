import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured, isSupportAssistantConfigured } from "@/lib/env";
import {
  BrandThemeGenerationError,
  brandThemeModel,
  generateBrandThemeVariants,
} from "@/lib/brand-theme/generate";
import { brandMoods, normalizeHexList } from "@/lib/brand-theme/generation-prompt";
import {
  BrandMaterialError,
  brandMaterialKinds,
  readBrandMaterials,
  type BrandMaterialKind,
} from "@/lib/brand-theme/materials";
import { brandThemeFreeGenerationsPerMonth } from "@/lib/brand-theme/limits";
import {
  countBrandThemeGenerationsUsed,
  getBrandThemeGenerationsLeft,
} from "@/lib/brand-theme/usage";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { hasCapability } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Генерация трёх вариантов фирменного стиля (ТЗ 4.6–4.8). Маршрут, а не
// server action: материалы весят мегабайты, а у server actions лимит тела
// в 1 МБ. Ответ — три черновика в brand_themes и сами темы для превью.

export const maxDuration = 120;

const GENERIC_ERROR = "Что-то пошло не так. Генерация не списана — попробуйте ещё раз.";

const briefSchema = z.object({
  hexColors: z.string().max(200).default(""),
  colorWords: z.string().trim().max(500).default(""),
  moods: z.array(z.enum(brandMoods)).max(brandMoods.length).default([]),
  wishes: z.string().trim().max(1000).default(""),
  regenerationComment: z.string().trim().max(500).default(""),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured || !isSupportAssistantConfigured) {
    return NextResponse.json({ error: "Генерация сейчас недоступна." }, { status: 503 });
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile;
  if (!profile) {
    return NextResponse.json({ error: "Сессия истекла. Войдите заново." }, { status: 401 });
  }
  if (!hasCapability(profile, "brandTheme")) {
    return NextResponse.json(
      { error: "Фирменный стиль доступен на тарифах «Расширенный» и «Студия»." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const brief = briefSchema.safeParse({
    hexColors: form.get("hexColors") ?? undefined,
    colorWords: form.get("colorWords") ?? undefined,
    moods: form.getAll("moods"),
    wishes: form.get("wishes") ?? undefined,
    regenerationComment: form.get("regenerationComment") ?? undefined,
  });
  if (!brief.success) {
    return NextResponse.json({ error: "Проверьте поля формы." }, { status: 400 });
  }

  const entries = brandMaterialKinds.flatMap((kind: BrandMaterialKind) =>
    form
      .getAll(kind)
      .filter((value): value is File => value instanceof File && value.size > 0)
      .map((file) => ({ kind, file })),
  );

  let materials;
  try {
    materials = await readBrandMaterials(entries);
  } catch (error) {
    if (error instanceof BrandMaterialError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const hexColors = normalizeHexList(brief.data.hexColors.split(/[\s,;]+/)).slice(0, 5);
  const hasText =
    hexColors.length > 0 ||
    brief.data.colorWords !== "" ||
    brief.data.moods.length > 0 ||
    brief.data.wishes !== "";
  if (materials.length === 0 && !hasText) {
    return NextResponse.json(
      { error: "Загрузите материалы или опишите стиль — без них не из чего собирать." },
      { status: 400 },
    );
  }

  const generationsLeft = await getBrandThemeGenerationsLeft(profile.id);
  if (generationsLeft <= 0) {
    return NextResponse.json(
      { error: "Бесплатные генерации на этот месяц закончились.", code: "limit" },
      { status: 402 },
    );
  }

  // Попытку списываем до запроса к Claude: иначе двойной клик дал бы две
  // генерации по цене одной. Если генерация не удалась — возвращаем.
  const admin = createSupabaseAdminClient();
  const { data: reservation, error: reserveError } = await admin
    .from("brand_theme_generations")
    .insert({ profile_id: profile.id, kind: "full" })
    .select("id")
    .single();
  if (reserveError || !reservation) {
    logError("Failed to reserve brand theme generation", { profileId: profile.id, error: reserveError });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  const refund = async () => {
    const { error } = await admin.from("brand_theme_generations").delete().eq("id", reservation.id);
    if (error) logError("Failed to refund brand theme generation", { profileId: profile.id, error });
  };

  // Два параллельных запроса оба видели «осталась одна» — тот, чей резерв
  // вывел счётчик за лимит, отступает.
  const usedNow = await countBrandThemeGenerationsUsed(profile.id);
  if (usedNow !== null && usedNow > brandThemeFreeGenerationsPerMonth) {
    await refund();
    return NextResponse.json(
      { error: "Бесплатные генерации на этот месяц закончились.", code: "limit" },
      { status: 402 },
    );
  }

  const textBrief = {
    specialty: profile.specialty,
    workspaceName: profile.workspaceName,
    hexColors,
    colorWords: brief.data.colorWords,
    moods: brief.data.moods,
    wishes: brief.data.wishes,
    regenerationComment: brief.data.regenerationComment,
  };

  let generation;
  try {
    generation = await generateBrandThemeVariants({ brief: textBrief, materials });
  } catch (error) {
    await refund();
    if (error instanceof BrandThemeGenerationError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    logError("Brand theme generation failed", { profileId: profile.id, error });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
  }

  // Черновики: мастер может вернуться к любому варианту из истории (4.15),
  // а «Поправить» продолжит с того же контекста.
  const { data: drafts, error: draftsError } = await admin
    .from("brand_themes")
    .insert(
      generation.variants.map((variant) => ({
        profile_id: profile.id,
        tokens: variant.theme,
        status: "draft",
        source: {
          generationId: reservation.id,
          model: brandThemeModel,
          name: variant.name,
          explanation: variant.explanation,
          contrastFixes: variant.contrastFixes,
          brief: textBrief,
          materials: materials.map(({ kind, name, type }) => ({ kind, name, type })),
          foundColors: generation.foundColors,
          foundFonts: generation.foundFonts,
          fontNote: generation.fontNote,
        },
      })),
    )
    .select("id");

  if (draftsError || !drafts || drafts.length !== generation.variants.length) {
    await refund();
    logError("Failed to save brand theme drafts", { profileId: profile.id, error: draftsError });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "brand_theme.generated",
    targetType: "profile",
    targetId: profile.id,
  });

  return NextResponse.json({
    generationsLeft: generationsLeft - 1,
    foundColors: generation.foundColors,
    foundFonts: generation.foundFonts,
    fontNote: generation.fontNote,
    variants: generation.variants.map((variant, index) => ({
      id: String(drafts[index].id),
      name: variant.name,
      explanation: variant.explanation,
      theme: variant.theme,
      contrastFixes: variant.contrastFixes,
    })),
  });
}
