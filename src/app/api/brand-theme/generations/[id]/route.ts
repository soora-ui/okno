import { NextResponse } from "next/server";
import { z } from "zod";
import { listGenerationVariants } from "@/lib/brand-theme/drafts";
import { requireBrandThemeProfile } from "@/lib/brand-theme/route-auth";
import { getBrandThemeGenerationsLeft } from "@/lib/brand-theme/usage";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Статус генерации — для «Соединение вернулось. Продолжаем» (4.16): клиент
// потерял ответ, но сервер генерацию довёл; забираем её результат.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBrandThemeProfile();
  if ("response" in auth) return auth.response;
  const { profile } = auth;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Генерация не найдена." }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_theme_generations")
    .select("status, error")
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (error) {
    logError("Failed to read brand theme generation", { profileId: profile.id, error });
    return NextResponse.json({ error: "Не получилось узнать статус." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Генерация не найдена." }, { status: 404 });
  }

  return NextResponse.json({
    status: data.status,
    error: data.error ?? null,
    generationsLeft: await getBrandThemeGenerationsLeft(profile.id),
    variants: data.status === "done" ? await listGenerationVariants(profile.id, id) : [],
  });
}
