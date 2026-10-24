import { brandThemeFreeGenerationsPerMonth } from "@/lib/brand-theme/limits";
import { isSupabaseConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function startOfMonthUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getBrandThemeGenerationsLeft(
  profileId: string,
  now = new Date(),
): Promise<number> {
  if (!isSupabaseConfigured) {
    return brandThemeFreeGenerationsPerMonth;
  }

  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("brand_theme_generations")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("kind", "full")
    .eq("paid", false)
    .gte("created_at", startOfMonthUtc(now));

  if (error) {
    // Миграции ещё нет или база недоступна: показываем полный лимит, а не
    // роняем настройки. Списание всё равно проверяется при генерации.
    logError("Failed to count brand theme generations", { profileId, error });
    return brandThemeFreeGenerationsPerMonth;
  }

  return Math.max(brandThemeFreeGenerationsPerMonth - (count ?? 0), 0);
}
