"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fixBrandThemeContrast } from "@/lib/brand-theme/contrast";
import { normalizeBrandTheme } from "@/lib/brand-theme/schema";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { hasCapability } from "@/lib/subscription";
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

// «Применить стиль» (ТЗ 4.13). Только на тарифе: при истёкшем тарифе стиль
// остаётся, но менять его нельзя (4.16). Тема перепроверяется схемой и
// контрастом даже из собственного черновика — в базу могли попасть ручные
// правки, а на публичную страницу уходит только проверенное.
export async function applyBrandThemeAction(
  themeId: string,
): Promise<BrandThemeActionState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Нужно подключение к Supabase." };
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile;
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }
  if (!hasCapability(profile, "brandTheme")) {
    return { success: false, message: "Изменить стиль можно после продления тарифа." };
  }
  if (!z.string().uuid().safeParse(themeId).success) {
    return { success: false, message: "Вариант не найден." };
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error: loadError } = await admin
    .from("brand_themes")
    .select("id, tokens")
    .eq("id", themeId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  const parsed = row ? normalizeBrandTheme(row.tokens) : null;
  if (loadError || !row || !parsed) {
    if (loadError) logError("Failed to load brand theme", { profileId: profile.id, error: loadError });
    return { success: false, message: "Вариант не найден." };
  }

  const { theme } = fixBrandThemeContrast(parsed);
  const appliedAt = new Date().toISOString();

  // Активная версия у мастера одна (уникальный индекс), поэтому сначала
  // прежняя уходит в архив, потом новая становится активной.
  const { error: archiveError } = await admin
    .from("brand_themes")
    .update({ status: "archived" })
    .eq("profile_id", profile.id)
    .eq("status", "active");
  const { error: activateError } = archiveError
    ? { error: archiveError }
    : await admin
        .from("brand_themes")
        .update({ status: "active", applied_at: appliedAt, tokens: theme })
        .eq("id", row.id);
  const { error: profileError } = activateError
    ? { error: activateError }
    : await admin
        .from("profiles")
        .update({ brand_theme: theme, brand_theme_applied_at: appliedAt })
        .eq("id", profile.id);

  if (profileError) {
    logError("Failed to apply brand theme", { profileId: profile.id, error: profileError });
    return { success: false, message: "Не получилось применить стиль. Попробуйте ещё раз." };
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
    eventType: "brand_theme.applied",
    targetType: "brand_theme",
    targetId: row.id,
  });

  return { success: true, message: "Стиль применён." };
}
