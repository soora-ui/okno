import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrandThemeVersion, mapBrandThemeRow } from "@/lib/brand-theme/drafts";
import {
  BrandRefineError,
  brandRefineChips,
  brandRefineTargets,
  refineBrandTheme,
  type BrandRefineTarget,
} from "@/lib/brand-theme/refine";
import { requireBrandThemeProfile } from "@/lib/brand-theme/route-auth";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// «Поправить» (4.11): бесплатно, но не бесконечно — правка тоже запрос к
// Claude. Потолок в сутки защищает от зацикленного клиента, а не от мастера.

export const maxDuration = 90;

const dailyRefineLimit = 30;

const bodySchema = z.object({
  themeId: z.string().uuid(),
  chips: z.array(z.enum(brandRefineChips)).max(brandRefineChips.length).default([]),
  comment: z.string().trim().max(500).default(""),
  target: z
    .enum(Object.keys(brandRefineTargets) as [BrandRefineTarget, ...BrandRefineTarget[]])
    .nullable()
    .default(null),
});

export async function POST(request: Request) {
  const auth = await requireBrandThemeProfile({ needsClaude: true });
  if ("response" in auth) return auth.response;
  const { profile } = auth;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  if (body.data.chips.length === 0 && !body.data.comment && !body.data.target) {
    return NextResponse.json(
      { error: "Выберите быструю правку или напишите, что изменить." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("brand_theme_generations")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("kind", "tweak")
    .gte("created_at", since);
  if ((count ?? 0) >= dailyRefineLimit) {
    return NextResponse.json(
      { error: "На сегодня правок достаточно. Завтра можно продолжить или настроить вручную." },
      { status: 429 },
    );
  }

  try {
    const current = await getBrandThemeVersion(profile.id, body.data.themeId);
    if (!current?.version) {
      return NextResponse.json({ error: "Вариант не найден." }, { status: 404 });
    }

    const refined = await refineBrandTheme({
      theme: current.version.theme,
      chips: body.data.chips,
      comment: body.data.comment,
      target: body.data.target,
    });

    await admin.from("brand_theme_generations").insert({ profile_id: profile.id, kind: "tweak" });

    const { data, error } = await admin
      .from("brand_themes")
      .insert({
        profile_id: profile.id,
        tokens: refined.theme,
        status: "draft",
        source: {
          ...current.source,
          parentId: current.version.id,
          name: refined.name || current.version.name,
          explanation: refined.explanation,
          contrastFixes: refined.contrastFixes,
          refine: body.data,
        },
      })
      .select("id, status, tokens, source, created_at, applied_at")
      .single();
    if (error || !data) throw error ?? new Error("refined draft insert returned no row");

    return NextResponse.json({ variant: mapBrandThemeRow(data as Record<string, unknown>) });
  } catch (error) {
    if (error instanceof BrandRefineError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    logError("Brand theme refine failed", { profileId: profile.id, error });
    return NextResponse.json(
      { error: "Не получилось внести правку. Попробуйте ещё раз." },
      { status: 502 },
    );
  }
}
