import { brandThemeFreeGenerationsPerMonth } from "@/lib/brand-theme/limits";
import { isSupabaseConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function startOfMonthUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Бесплатные полные генерации в этом месяце; null — база не ответила. */
export async function countBrandThemeGenerationsUsed(
  profileId: string,
  now = new Date(),
): Promise<number | null> {
  if (!isSupabaseConfigured) return 0;

  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("brand_theme_generations")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("kind", "full")
    .eq("paid", false)
    // Неудавшаяся генерация попытку не тратит (4.16, «Генерация не списана»).
    .neq("status", "failed")
    .gte("created_at", startOfMonthUtc(now));

  if (error) {
    logError("Failed to count brand theme generations", { profileId, error });
    return null;
  }

  return count ?? 0;
}

export async function getBrandThemeGenerationsLeft(
  profileId: string,
  now = new Date(),
): Promise<number> {
  const used = await countBrandThemeGenerationsUsed(profileId, now);
  // Миграции ещё нет или база недоступна: показываем полный лимит, а не
  // роняем настройки. Списание всё равно перепроверяется при генерации.
  if (used === null) return brandThemeFreeGenerationsPerMonth;
  return Math.max(brandThemeFreeGenerationsPerMonth - used, 0);
}
