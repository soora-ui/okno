import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageBrandStyle } from "@/components/brand-style/manage";
import { getCurrentAuthProfile } from "@/lib/data";
import { listBrandThemeVersions } from "@/lib/brand-theme/drafts";
import { listBrandMaterials } from "@/lib/brand-theme/storage";
import { getBrandThemeGenerationsLeft } from "@/lib/brand-theme/usage";
import { hasCapability } from "@/lib/subscription";

// 4.15 «Управление фирменным стилем»: активная версия, история, материалы.

export const metadata: Metadata = { title: "Фирменный стиль" };

export default async function BrandStyleManagePage() {
  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile;
  if (!profile) redirect("/login?next=/settings/brand-style");

  const [versions, materials, generationsLeft] = await Promise.all([
    listBrandThemeVersions(profile.id, 24).catch(() => []),
    listBrandMaterials(profile.id).catch(() => []),
    getBrandThemeGenerationsLeft(profile.id),
  ]);

  return (
    <ManageBrandStyle
      versions={versions}
      materials={materials}
      generationsLeft={generationsLeft}
      hasAccess={hasCapability(profile, "brandTheme")}
      appliedAt={profile.brandThemeAppliedAt}
      master={{
        name: profile.fullName,
        specialty: profile.specialty,
        city: profile.locationText,
        avatarUrl: profile.avatarUrl || null,
        services: [
          { title: "Ваша услуга", meta: "1 ч · по прайсу" },
          { title: "Ещё услуга", meta: "45 мин · по прайсу" },
        ],
      }}
    />
  );
}
