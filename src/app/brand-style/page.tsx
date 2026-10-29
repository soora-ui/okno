import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandStyleWizard } from "@/components/brand-style/wizard";
import { getCurrentAuthProfile } from "@/lib/data";
import { listBrandThemeVersions } from "@/lib/brand-theme/drafts";
import { listBrandMaterials } from "@/lib/brand-theme/storage";
import { getBrandThemeGenerationsLeft } from "@/lib/brand-theme/usage";
import { formatCurrency } from "@/lib/mock-data";
import { logError } from "@/lib/observability/logger";
import { hasCapability } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Мастер фирменного стиля (макеты 4.2–4.13): полноэкранный, вне каркаса
// кабинета — у него своя шапка с «Закрыть», шагами и счётчиком.

export const metadata: Metadata = {
  title: "Фирменный стиль",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ theme?: string; manual?: string }>;
};

export default async function BrandStylePage({ searchParams }: Props) {
  const [authProfile, query] = await Promise.all([getCurrentAuthProfile(), searchParams]);
  const profile = authProfile?.profile;
  if (!profile) redirect("/login?next=/brand-style");
  if (!hasCapability(profile, "brandTheme")) redirect("/settings?tab=booking");

  const admin = createSupabaseAdminClient();
  const [generationsLeft, materials, versions, draftRow, servicesRows] = await Promise.all([
    getBrandThemeGenerationsLeft(profile.id),
    listBrandMaterials(profile.id).catch((error) => {
      logError("Failed to list brand materials", { profileId: profile.id, error });
      return [];
    }),
    listBrandThemeVersions(profile.id).catch(() => []),
    admin
      .from("brand_theme_wizard_drafts")
      .select("state")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => data),
    admin
      .from("services")
      .select("title, duration_minutes, price")
      .eq("profile_id", profile.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(2)
      .then(({ data }) => data ?? []),
  ]);

  const services = servicesRows.map((row) => ({
    title: String(row.title),
    meta: `${Number(row.duration_minutes)} мин · ${formatCurrency(Number(row.price))}`,
  }));

  return (
    <BrandStyleWizard
      username={profile.username}
      generationsLeft={generationsLeft}
      materials={materials}
      versions={versions}
      draft={(draftRow?.state as Record<string, unknown> | undefined) ?? null}
      initialThemeId={query.theme ?? query.manual ?? null}
      initialManual={Boolean(query.manual)}
      master={{
        name: profile.fullName,
        specialty: profile.specialty,
        city: profile.locationText,
        avatarUrl: profile.avatarUrl || null,
        services:
          services.length > 0
            ? services
            : [
                { title: "Маникюр с покрытием", meta: "2 ч · 2 400 ₽" },
                { title: "Педикюр", meta: "2 ч 30 мин · 2 800 ₽" },
              ],
      }}
    />
  );
}
