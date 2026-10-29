import { NextResponse } from "next/server";
import { requireBrandThemeProfile } from "@/lib/brand-theme/route-auth";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Ответ на генерацию потерялся вместе со связью, и клиент не знает её id:
// находим последнюю, начатую не раньше момента отправки (с запасом на
// расхождение часов).
export async function GET(request: Request) {
  const auth = await requireBrandThemeProfile();
  if ("response" in auth) return auth.response;

  const since = new Date(new URL(request.url).searchParams.get("since") ?? "");
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_theme_generations")
    .select("id, status, error")
    .eq("profile_id", auth.profile.id)
    .eq("kind", "full")
    .gte("created_at", new Date(since.getTime() - 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logError("Failed to find latest brand theme generation", { profileId: auth.profile.id, error });
    return NextResponse.json({ error: "Не получилось узнать статус." }, { status: 500 });
  }

  return NextResponse.json({
    generation: data ? { id: String(data.id), status: data.status, error: data.error ?? null } : null,
  });
}

// «Отменить» на экране ожидания (4.7): генерация, которая ещё идёт,
// помечается отменённой — в лимит она не идёт, а маршрут генерации,
// закончив, не сохраняет её варианты.
export async function DELETE(request: Request) {
  const auth = await requireBrandThemeProfile();
  if ("response" in auth) return auth.response;

  const since = new Date(new URL(request.url).searchParams.get("since") ?? "");
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("brand_theme_generations")
    .update({ status: "failed", error: "cancelled" })
    .eq("profile_id", auth.profile.id)
    .eq("kind", "full")
    .eq("status", "pending")
    .gte("created_at", new Date(since.getTime() - 60_000).toISOString());
  if (error) {
    logError("Failed to cancel brand theme generation", { profileId: auth.profile.id, error });
    return NextResponse.json({ error: "Не получилось отменить." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
