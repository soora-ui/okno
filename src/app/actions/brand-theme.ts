"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type BrandThemeActionState = {
  success: boolean;
  message: string;
};

// «Вернуть стандартный пресет». Доступно и без тарифа: мастер, у которого
// тариф истёк, должен иметь возможность убрать свой стиль. Версия не
// удаляется, а уходит в архив — к ней можно будет вернуться из истории.
export async function resetBrandThemeAction(): Promise<BrandThemeActionState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Нужно подключение к Supabase." };
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile;
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ brand_theme: null, brand_theme_applied_at: null })
    .eq("id", profile.id);

  if (error) {
    logError("Failed to reset brand theme", { profileId: profile.id, error });
    return { success: false, message: "Не получилось вернуть стандартный пресет." };
  }

  const { error: archiveError } = await admin
    .from("brand_themes")
    .update({ status: "archived" })
    .eq("profile_id", profile.id)
    .eq("status", "active");

  if (archiveError) {
    // Страница уже на пресете — это главное; история догонится при
    // следующем применении стиля.
    logError("Failed to archive active brand theme", {
      profileId: profile.id,
      error: archiveError,
    });
  }

  revalidatePath("/settings");
  revalidatePath(`/${profile.username}`);
  revalidatePath(`/${profile.username}/book`);
  revalidatePath(`/${profile.username}/confirm`);

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "brand_theme.reset",
    targetType: "profile",
    targetId: profile.id,
  });

  return { success: true, message: "Вернули стандартный пресет." };
}
