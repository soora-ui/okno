import { NextResponse } from "next/server";
import { z } from "zod";
import { listGenerationVariants } from "@/lib/brand-theme/drafts";
import {
  BrandThemeGenerationError,
  brandThemeModel,
  generateBrandThemeVariants,
} from "@/lib/brand-theme/generate";
import { brandMoods, normalizeHexList } from "@/lib/brand-theme/generation-prompt";
import { brandThemeFreeGenerationsPerMonth } from "@/lib/brand-theme/limits";
import { maxTotalBytes, totalMaterialBytes } from "@/lib/brand-theme/materials";
import { requireBrandThemeProfile } from "@/lib/brand-theme/route-auth";
import { brandFontIds } from "@/lib/brand-theme/schema";
import { loadBrandMaterials, publishBrandLogo } from "@/lib/brand-theme/storage";
import {
  countBrandThemeGenerationsUsed,
  getBrandThemeGenerationsLeft,
} from "@/lib/brand-theme/usage";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Генерация трёх вариантов (макеты 4.6–4.8, 4.11 «Сгенерировать заново»).
// Материалы уже лежат в хранилище — сюда приходят их id и то, что мастер
// написал. Генерация получает статус: если у мастера пропала связь, сервер
// доводит её до конца, а клиент потом спрашивает
// /api/brand-theme/generations/[id].

export const maxDuration = 120;

const GENERIC_ERROR = "Что-то пошло не так. Генерация не списана — попробуйте ещё раз.";

const bodySchema = z.object({
  materialIds: z.array(z.string().uuid()).max(20).default([]),
  logoMaterialId: z.string().uuid().nullable().default(null),
  logoDarkMaterialId: z.string().uuid().nullable().default(null),
  hexColors: z.array(z.string()).max(8).default([]),
  colorWords: z.string().trim().max(500).default(""),
  moods: z.array(z.enum(brandMoods)).max(brandMoods.length).default([]),
  wishes: z.string().trim().max(1000).default(""),
  regenerationComment: z.string().trim().max(500).default(""),
  preferredFonts: z
    .object({
      heading: z.enum(brandFontIds).nullable(),
      body: z.enum(brandFontIds).nullable(),
    })
    .default({ heading: null, body: null }),
});

export async function POST(request: Request) {
  const auth = await requireBrandThemeProfile({ needsClaude: true });
  if ("response" in auth) return auth.response;
  const { profile } = auth;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Проверьте поля формы." }, { status: 400 });
  }
  const input = body.data;

  const logoIds = [input.logoMaterialId, input.logoDarkMaterialId].filter(
    (id): id is string => id !== null,
  );
  let materials;
  let logos;
  try {
    materials = await loadBrandMaterials(
      profile.id,
      input.materialIds.filter((id) => !logoIds.includes(id)).concat(logoIds.slice(0, 1)),
    );
    logos = await loadBrandMaterials(profile.id, logoIds);
  } catch (error) {
    logError("Failed to load brand materials", { profileId: profile.id, error });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
  if (totalMaterialBytes(materials) > maxTotalBytes) {
    return NextResponse.json(
      { error: "Материалов слишком много за раз: оставьте самые важные." },
      { status: 400 },
    );
  }

  const hexColors = normalizeHexList(input.hexColors).slice(0, 8);
  const hasText =
    hexColors.length > 0 || input.colorWords !== "" || input.moods.length > 0 || input.wishes !== "";
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

  // Попытку резервируем до запроса к Claude: иначе двойной клик дал бы две
  // генерации по цене одной. Неудача помечается failed и в лимит не идёт.
  const admin = createSupabaseAdminClient();
  const { data: reservation, error: reserveError } = await admin
    .from("brand_theme_generations")
    .insert({ profile_id: profile.id, kind: "full", status: "pending" })
    .select("id")
    .single();
  if (reserveError || !reservation) {
    logError("Failed to reserve brand theme generation", { profileId: profile.id, error: reserveError });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
  const generationId = String(reservation.id);

  const fail = async (message: string, status: number, error?: unknown) => {
    if (error) logError("Brand theme generation failed", { profileId: profile.id, error });
    await admin
      .from("brand_theme_generations")
      .update({ status: "failed", error: message })
      .eq("id", generationId);
    return NextResponse.json({ error: message, generationId }, { status });
  };

  // Два параллельных запроса оба видели «осталась одна» — тот, чей резерв
  // вывел счётчик за лимит, отступает.
  const usedNow = await countBrandThemeGenerationsUsed(profile.id);
  if (usedNow !== null && usedNow > brandThemeFreeGenerationsPerMonth) {
    await admin.from("brand_theme_generations").delete().eq("id", generationId);
    return NextResponse.json(
      { error: "Бесплатные генерации на этот месяц закончились.", code: "limit" },
      { status: 402 },
    );
  }

  const brief = {
    specialty: profile.specialty,
    workspaceName: profile.workspaceName,
    hexColors,
    colorWords: input.colorWords,
    moods: input.moods,
    wishes: input.wishes,
    regenerationComment: input.regenerationComment,
    preferredFonts: input.preferredFonts,
  };

  let generation;
  let logo: { path: string; darkPath: string | null } | null = null;
  try {
    generation = await generateBrandThemeVariants({ brief, materials });
    const lightLogo = logos.find((item) => item.id === input.logoMaterialId);
    const darkLogo = logos.find((item) => item.id === input.logoDarkMaterialId);
    const path = lightLogo ? await publishBrandLogo(profile.passwordAuthId, lightLogo) : null;
    if (path) {
      logo = {
        path,
        darkPath: darkLogo ? await publishBrandLogo(profile.passwordAuthId, darkLogo) : null,
      };
    }
  } catch (error) {
    if (error instanceof BrandThemeGenerationError) return fail(error.message, 502);
    return fail(GENERIC_ERROR, 502, error);
  }

  const { error: draftsError } = await admin.from("brand_themes").insert(
    generation.variants.map((variant) => ({
      profile_id: profile.id,
      tokens: { ...variant.theme, logo },
      status: "draft",
      source: {
        generationId,
        model: brandThemeModel,
        name: variant.name,
        explanation: variant.explanation,
        contrastFixes: variant.contrastFixes,
        brief,
        materialIds: materials.map((material) => material.id),
        logoMaterialId: input.logoMaterialId,
        logoDarkMaterialId: input.logoDarkMaterialId,
        foundColors: generation.foundColors,
        foundFonts: generation.foundFonts,
        fontNote: generation.fontNote,
      },
    })),
  );
  if (draftsError) return fail(GENERIC_ERROR, 500, draftsError);

  await admin.from("brand_theme_generations").update({ status: "done" }).eq("id", generationId);

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
    generationId,
    generationsLeft: Math.max(generationsLeft - 1, 0),
    fontNote: generation.fontNote,
    variants: await listGenerationVariants(profile.id, generationId),
  });
}
