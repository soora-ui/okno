import type { ContrastFix } from "@/lib/brand-theme/contrast";
import { normalizeBrandTheme, type BrandTheme } from "@/lib/brand-theme/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Версии фирменного стиля в brand_themes: черновики из генерации и правок,
// активная и архивные (макет 4.15, «История версий»).

export type BrandThemeVersion = {
  id: string;
  status: "draft" | "active" | "archived";
  name: string;
  explanation: string;
  theme: BrandTheme;
  contrastFixes: ContrastFix[];
  generationId: string | null;
  createdAt: string;
  appliedAt: string | null;
};

export function mapBrandThemeRow(row: Record<string, unknown>): BrandThemeVersion | null {
  const theme = normalizeBrandTheme(row.tokens);
  if (!theme) return null;
  const source = (row.source ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    status: row.status as BrandThemeVersion["status"],
    name: typeof source.name === "string" ? source.name : "Вариант",
    explanation: typeof source.explanation === "string" ? source.explanation : "",
    theme,
    contrastFixes: Array.isArray(source.contrastFixes) ? (source.contrastFixes as ContrastFix[]) : [],
    generationId: typeof source.generationId === "string" ? source.generationId : null,
    createdAt: String(row.created_at),
    appliedAt: row.applied_at ? String(row.applied_at) : null,
  };
}

const columns = "id, status, tokens, source, created_at, applied_at";

export async function listBrandThemeVersions(profileId: string, limit = 12) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_themes")
    .select(columns)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .map((row) => mapBrandThemeRow(row as Record<string, unknown>))
    .filter((version): version is BrandThemeVersion => version !== null);
}

export async function getBrandThemeVersion(profileId: string, id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_themes")
    .select(columns)
    .eq("profile_id", profileId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { version: mapBrandThemeRow(data as Record<string, unknown>), source: data.source as Record<string, unknown> } : null;
}

export async function listGenerationVariants(profileId: string, generationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_themes")
    .select(columns)
    .eq("profile_id", profileId)
    .eq("source->>generationId", generationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((row) => mapBrandThemeRow(row as Record<string, unknown>))
    .filter((version): version is BrandThemeVersion => version !== null);
}

/** Тема черновика для превью: только своя версия, иначе null. */
export async function getBrandThemePreview(profileId: string, id: string): Promise<BrandTheme | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    return (await getBrandThemeVersion(profileId, id))?.version?.theme ?? null;
  } catch {
    return null;
  }
}

/**
 * Логотип в теме должен быть свой: схема проверяет форму пути, а здесь —
 * что это папка самого мастера. Чужой путь из ручной правки отбрасывается.
 */
export function withOwnLogo(theme: BrandTheme, authId: string): BrandTheme {
  if (!theme.logo) return theme;
  const own = (path: string | null) => (path && path.startsWith(`${authId}/brand-logo/`) ? path : null);
  const path = own(theme.logo.path);
  return { ...theme, logo: path ? { path, darkPath: own(theme.logo.darkPath) } : null };
}
