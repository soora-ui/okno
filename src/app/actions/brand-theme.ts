"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fixBrandThemeContrast } from "@/lib/brand-theme/contrast";
import { getBrandThemeVersion, withOwnLogo } from "@/lib/brand-theme/drafts";
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

  const { theme } = fixBrandThemeContrast(withOwnLogo(parsed, profile.passwordAuthId));
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

// «Настроить вручную» → «Готово» (4.12). Ручные правки генераций не тратят;
// каждая сохраняется новой версией, чтобы «Сбросить к сгенерированному» и
// история (4.15) работали. Читаемость не чинится молча: мастер видит
// предупреждение и сам жмёт «Исправить автоматически»; на публичную
// страницу тема всё равно попадёт только через apply, где контраст
// перепроверяется.
export async function saveManualBrandThemeAction(input: {
  parentId: string;
  tokens: unknown;
}): Promise<BrandThemeActionState & { themeId?: string }> {
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

  const parsed = normalizeBrandTheme(input.tokens);
  const parent = z.string().uuid().safeParse(input.parentId).success
    ? await getBrandThemeVersion(profile.id, input.parentId)
    : null;
  if (!parsed || !parent?.version) {
    return { success: false, message: "Не получилось сохранить: проверьте значения." };
  }

  const theme = withOwnLogo(parsed, profile.passwordAuthId);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brand_themes")
    .insert({
      profile_id: profile.id,
      tokens: theme,
      status: "draft",
      source: {
        ...parent.source,
        parentId: parent.version.id,
        name: "Ручная настройка",
        explanation: "Ваши правки поверх варианта «" + parent.version.name + "».",
        contrastFixes: [],
        manual: true,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    logError("Failed to save manual brand theme", { profileId: profile.id, error });
    return { success: false, message: "Не получилось сохранить. Попробуйте ещё раз." };
  }

  return { success: true, message: "Сохранено.", themeId: String(data.id) };
}

// «Сохранить черновик?» (4.16): шаг мастера, выбранные материалы и тексты.
// Файлов здесь нет — только их id из brand_materials.
const wizardDraftSchema = z.object({
  step: z.string().max(40),
  path: z.enum(["brandbook", "describe"]).nullable(),
  materialIds: z.array(z.string().uuid()).max(20),
  logoMaterialId: z.string().uuid().nullable(),
  logoDarkMaterialId: z.string().uuid().nullable(),
  hexColors: z.array(z.string().max(9)).max(8),
  colorWords: z.string().max(500),
  moods: z.array(z.string().max(20)).max(8),
  wishes: z.string().max(1000),
  preferredFonts: z.object({
    heading: z.string().max(40).nullable(),
    body: z.string().max(40).nullable(),
  }),
});

export type BrandWizardDraft = z.infer<typeof wizardDraftSchema>;

export async function saveBrandWizardDraftAction(
  state: BrandWizardDraft | null,
): Promise<BrandThemeActionState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Нужно подключение к Supabase." };
  }
  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile;
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const admin = createSupabaseAdminClient();
  if (state === null) {
    await admin.from("brand_theme_wizard_drafts").delete().eq("profile_id", profile.id);
    return { success: true, message: "" };
  }

  const parsed = wizardDraftSchema.safeParse(state);
  if (!parsed.success) {
    return { success: false, message: "Не получилось сохранить черновик." };
  }

  const { error } = await admin
    .from("brand_theme_wizard_drafts")
    .upsert({ profile_id: profile.id, state: parsed.data, updated_at: new Date().toISOString() });
  if (error) {
    logError("Failed to save brand wizard draft", { profileId: profile.id, error });
    return { success: false, message: "Не получилось сохранить черновик." };
  }
  return { success: true, message: "Черновик сохранён." };
}
