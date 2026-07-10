"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";
import {
  getCityLabel,
  resolveTimezoneForCity,
} from "@/lib/cities";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { bookingThemePresetIds } from "@/lib/booking-theme-presets";
import {
  bookingPageSettingsFormSchema,
  headlineMaxLength,
  subheadlineMaxLength,
} from "@/lib/booking-page-settings";
import { getCurrentAuthProfile } from "@/lib/data";
import {
  buildPortfolioWorksFromPaths,
  extractPortfolioStoragePaths,
  isOwnedProfileMediaPath,
  maxPortfolioWorks,
  profileMediaBucket,
} from "@/lib/profile-media";
import { mergeProfileMedia } from "@/lib/mappers/domain";
import { getOwnerProfileMediaRow } from "@/lib/repositories/owner-repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingColumnError } from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingsActionState = {
  success: boolean;
  message: string;
};

const profileSchema = z.object({
  fullName: z.string().trim().min(2),
  specialty: z.string().trim().min(2),
  city: z.string().trim().min(2),
  address: z.string().trim().max(200).default(""),
  bio: z.string().trim().default(""),
});

const preferencesSchema = z.object({
  bookingWindowDays: z.coerce.number().min(1).max(365),
  slotIntervalMinutes: z.coerce.number().min(5).max(180),
  bufferMinutes: z.coerce.number().min(0).max(180),
  cancellationNoticeHours: z.coerce.number().min(0).max(168),
  clientReminderHours: z.coerce.number().min(0).max(168),
  masterReminderHours: z.coerce.number().min(0).max(168),
});

const bookingThemePresetSchema = z.object({
  bookingThemePreset: z.enum(bookingThemePresetIds),
});

const accessSchema = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(8),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
});

const blockedSlotSchema = z.object({
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  reason: z.string().trim().default(""),
});

async function requireProfile() {
  if (!isSupabaseConfigured) return null;

  const authProfile = await getCurrentAuthProfile();

  return authProfile?.profile ?? null;
}

async function requireProfileWithMedia() {
  const profile = await requireProfile();

  if (!profile) {
    return null;
  }

  const mediaRow = await getOwnerProfileMediaRow({ profileId: profile.id });
  return mergeProfileMedia(profile, mediaRow);
}

function revalidateProfilePaths(username: string) {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath(`/${username}`);
}

function getAuditProfileContext(profile: NonNullable<Awaited<ReturnType<typeof requireProfile>>>) {
  return {
    actorKind: "master" as const,
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
  };
}

async function removeProfileMediaObjects(paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  const admin = createSupabaseAdminClient();
  await admin.storage.from(profileMediaBucket).remove(paths);
}

export async function updateProfileAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для сохранения профиля нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message:
        "Проверь профиль: имя и ниша должны быть заполнены, остальные поля можно оставить пустыми.",
    };
  }

  const timezone = resolveTimezoneForCity(parsed.data.city);
  const locationText = getCityLabel(parsed.data.city);
  const supabase = await createSupabaseServerClient();
  const profileUpdate = {
    full_name: parsed.data.fullName,
    specialty: parsed.data.specialty,
    location_text: locationText,
    timezone,
    address: parsed.data.address,
    bio: parsed.data.bio,
  };

  let { error } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", profile.id);

  // Колонки address ещё может не быть (миграция не прогнана) — сохраняем
  // остальные поля профиля, чтобы форма не падала целиком.
  if (error && isSupabaseMissingColumnError(error, "address")) {
    const { address: _address, ...legacyUpdate } = profileUpdate;
    void _address;
    const retry = await supabase
      .from("profiles")
      .update(legacyUpdate)
      .eq("id", profile.id);
    error = retry.error;
  }

  if (error) {
    logError("Failed to update profile", { profileId: profile.id, error });
    return {
      success: false,
      message: `Не получилось обновить профиль.${error.message ? ` ${error.message}` : ""}`,
    };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "profile.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: {
      city: locationText,
      timezone,
      specialty: parsed.data.specialty,
    },
  });

  revalidateProfilePaths(profile.username);

  return { success: true, message: "Профиль обновлен." };
}

export async function updateAvatarAction(input: { path: string }) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для обновления аватара нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfileWithMedia();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  if (!input.path) {
    return {
      success: false,
      message: "Не передан путь до нового аватара.",
    };
  }

  if (!isOwnedProfileMediaPath(input.path, profile.passwordAuthId, "avatar")) {
    return {
      success: false,
      message: "Путь аватара не принадлежит текущему пользователю.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: input.path,
    })
    .eq("id", profile.id);

  if (error) {
    await removeProfileMediaObjects([input.path]);
    logError("Failed to update avatar", { profileId: profile.id, error });
    return {
      success: false,
      message: `Не получилось обновить аватар.${error.message ? ` ${error.message}` : ""}`,
    };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "profile.avatar.updated",
    targetType: "profile",
    targetId: profile.id,
  });

  revalidateProfilePaths(profile.username);

  if (profile.avatarPath && profile.avatarPath !== input.path) {
    await removeProfileMediaObjects([profile.avatarPath]);
  }

  return { success: true, message: "Аватар обновлен." };
}

export async function updatePortfolioWorksAction(input: { paths: string[] }) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для загрузки работ нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfileWithMedia();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  if (input.paths.length === 0) {
    return {
      success: false,
      message: "Не переданы пути до готовых работ.",
    };
  }

  if (input.paths.length > maxPortfolioWorks) {
    return {
      success: false,
      message: `Можно загрузить не больше ${maxPortfolioWorks} готовых работ за раз.`,
    };
  }

  for (const path of input.paths) {
    if (!isOwnedProfileMediaPath(path, profile.passwordAuthId, "portfolio")) {
      return {
        success: false,
        message: "Одна из работ не принадлежит текущему пользователю.",
      };
    }
  }

  const nextPortfolioWorks = buildPortfolioWorksFromPaths(input.paths);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      portfolio_works: nextPortfolioWorks,
    })
    .eq("id", profile.id);

  if (error) {
    await removeProfileMediaObjects(input.paths);
    logError("Failed to update portfolio works", { profileId: profile.id, error });
    return {
      success: false,
      message: `Не получилось обновить готовые работы.${error.message ? ` ${error.message}` : ""}`,
    };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "profile.portfolio.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: {
      workCount: nextPortfolioWorks.length,
    },
  });

  revalidateProfilePaths(profile.username);

  const previousPaths = extractPortfolioStoragePaths(profile.portfolioWorks);
  const obsoletePaths = previousPaths.filter((path) => !input.paths.includes(path));
  await removeProfileMediaObjects(obsoletePaths);

  return { success: true, message: "Готовые работы обновлены." };
}

export async function updateBookingPreferencesAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для сохранения настроек записи нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = preferencesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Проверь настройки записи." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      booking_window_days: parsed.data.bookingWindowDays,
      slot_interval_minutes: parsed.data.slotIntervalMinutes,
      buffer_minutes: parsed.data.bufferMinutes,
      cancellation_notice_hours: parsed.data.cancellationNoticeHours,
      client_reminder_hours: parsed.data.clientReminderHours,
      master_reminder_hours: parsed.data.masterReminderHours,
    })
    .eq("id", profile.id);

  if (error) {
    logError("Failed to update booking preferences", { profileId: profile.id, error });
    return {
      success: false,
      message: "Не получилось обновить параметры записи.",
    };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "booking_preferences.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: parsed.data,
  });

  revalidatePath("/settings");
  return { success: true, message: "Параметры записи сохранены." };
}

export async function updateBookingThemePresetAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для сохранения оформления записи нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = bookingThemePresetSchema.safeParse({
    bookingThemePreset: formData.get("bookingThemePreset"),
  });
  if (!parsed.success) {
    return { success: false, message: "Выбери один из готовых пресетов." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      booking_theme_preset: parsed.data.bookingThemePreset,
    })
    .eq("id", profile.id);

  if (error) {
    if (isSupabaseMissingColumnError(error, "booking_theme_preset")) {
      return {
        success: false,
        message:
          "В базе еще нет поля для пресета. Прогони миграцию 202604190001_booking_theme_preset.sql и попробуй еще раз.",
      };
    }

    logError("Failed to update booking theme preset", { profileId: profile.id, error });
    return {
      success: false,
      message: `Не получилось сохранить оформление клиентских страниц.${error.message ? ` ${error.message}` : ""}`,
    };
  }

  revalidatePath("/settings");
  revalidatePath(`/${profile.username}`);
  revalidatePath(`/${profile.username}/book`);
  revalidatePath(`/${profile.username}/confirm`);

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "booking_theme.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: {
      preset: parsed.data.bookingThemePreset,
    },
  });

  return {
    success: true,
    message: "Оформление клиентских страниц сохранено.",
  };
}

export async function updateBookingPageSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для сохранения страницы записи нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = bookingPageSettingsFormSchema.safeParse({
    headline: formData.get("headline") ?? "",
    subheadline: formData.get("subheadline") ?? "",
    commentFieldMode: formData.get("commentFieldMode") ?? "optional",
  });
  if (!parsed.success) {
    return {
      success: false,
      message: `Проверь поля: заголовок до ${headlineMaxLength}, подзаголовок до ${subheadlineMaxLength} символов.`,
    };
  }

  const nextSettings = {
    ...profile.bookingPageSettings,
    headline: parsed.data.headline,
    subheadline: parsed.data.subheadline,
    commentFieldMode: parsed.data.commentFieldMode,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      booking_page_settings: nextSettings,
    })
    .eq("id", profile.id);

  if (error) {
    if (isSupabaseMissingColumnError(error, "booking_page_settings")) {
      return {
        success: false,
        message:
          "В базе еще нет поля настроек страницы записи. Прогони миграцию 202604250001_booking_page_settings.sql и попробуй еще раз.",
      };
    }

    logError("Failed to update booking page settings", { profileId: profile.id, error });
    return {
      success: false,
      message: `Не получилось сохранить страницу записи.${error.message ? ` ${error.message}` : ""}`,
    };
  }

  revalidateProfilePaths(profile.username);
  revalidatePath(`/${profile.username}/book`);

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "booking_page_settings.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: {
      commentFieldMode: parsed.data.commentFieldMode,
      hasHeadline: parsed.data.headline.length > 0,
    },
  });

  return {
    success: true,
    message: "Страница записи обновлена.",
  };
}

export async function updateAccessAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для смены email и пароля нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = accessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Проверь email и текущий пароль." };
  }

  const supabase = await createSupabaseServerClient();

  const emailChanged = parsed.data.email !== profile.email;
  const passwordChanged = Boolean(parsed.data.password);

  if (!emailChanged && !passwordChanged) {
    return {
      success: false,
      message: "Нечего обновлять: измени email или введи новый пароль.",
    };
  }

  if (
    passwordChanged &&
    parsed.data.password !== parsed.data.confirmPassword
  ) {
    return {
      success: false,
      message: "Новый пароль и подтверждение не совпадают.",
    };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: parsed.data.currentPassword,
  });

  if (verifyError) {
    return {
      success: false,
      message: "Текущий пароль введен неверно.",
    };
  }

  const updatePayload: { email?: string; password?: string } = {
    email: parsed.data.email,
  };

  if (parsed.data.password && parsed.data.password.length >= 8) {
    updatePayload.password = parsed.data.password;
  }

  const { error: authError } = await supabase.auth.updateUser(updatePayload);
  if (authError) {
    logError("Failed to update auth access", { profileId: profile.id, error: authError });
    return {
      success: false,
      message: "Не получилось обновить доступ к аккаунту.",
    };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ email: parsed.data.email })
    .eq("id", profile.id);

  if (profileError) {
    logError("Auth updated but profile email sync failed", { profileId: profile.id, error: profileError });
    return {
      success: false,
      message: "Данные входа обновились частично. Проверь email позже.",
    };
  }

  revalidatePath("/settings");
  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "account.access.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: {
      emailChanged,
      passwordChanged,
    },
  });
  return { success: true, message: "Данные входа обновлены." };
}

const serviceSchema = z.object({
  title: z.string().min(2),
  description: z.string().default(""),
  durationMinutes: z.coerce.number().min(5).max(480),
  price: z.coerce.number().min(0),
  sortOrder: z.coerce.number().min(0).default(0),
  // Пусто/0 — не предлагать клиенту напоминание о повторном визите для
  // этой услуги.
  repeatIntervalWeeks: z.coerce.number().min(0).max(52).default(0),
});

export async function createServiceAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для управления услугами нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Проверь поля новой услуги." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("services").insert({
    profile_id: profile.id,
    title: parsed.data.title,
    description: parsed.data.description,
    duration_minutes: parsed.data.durationMinutes,
    price: parsed.data.price,
    sort_order: parsed.data.sortOrder,
    is_active: true,
    repeat_interval_weeks: parsed.data.repeatIntervalWeeks > 0
      ? parsed.data.repeatIntervalWeeks
      : null,
  });

  if (error) {
    logError("Failed to create service", { profileId: profile.id, error });
    return { success: false, message: "Не получилось создать услугу." };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "service.created",
    targetType: "service",
    metadata: {
      title: parsed.data.title,
      durationMinutes: parsed.data.durationMinutes,
      price: parsed.data.price,
    },
  });

  revalidatePath("/settings");
  revalidatePath(`/${profile.username}`);
  return { success: true, message: "Услуга добавлена." };
}

export async function updateServiceAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для управления услугами нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const serviceId = String(formData.get("serviceId") ?? "");
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!serviceId || !parsed.success) {
    return { success: false, message: "Проверь поля услуги." };
  }

  const visibilityAction = String(formData.get("visibilityAction") ?? "");
  const nextActive =
    visibilityAction === "hide"
      ? false
      : visibilityAction === "show"
        ? true
        : formData.get("isActive") === "on";

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("services")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      duration_minutes: parsed.data.durationMinutes,
      price: parsed.data.price,
      sort_order: parsed.data.sortOrder,
      is_active: nextActive,
      repeat_interval_weeks: parsed.data.repeatIntervalWeeks > 0
        ? parsed.data.repeatIntervalWeeks
        : null,
    })
    .eq("id", serviceId)
    .eq("profile_id", profile.id);

  if (error) {
    logError("Failed to update service", { profileId: profile.id, serviceId, error });
    return { success: false, message: "Не получилось обновить услугу." };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "service.updated",
    targetType: "service",
    targetId: serviceId,
    metadata: {
      title: parsed.data.title,
      isActive: nextActive,
    },
  });

  revalidatePath("/settings");
  revalidatePath(`/${profile.username}`);
  return { success: true, message: "Услуга обновлена." };
}

export async function updateAvailabilityAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для сохранения графика нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const rows: Array<{
    profile_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
  }> = [];

  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const enabled = formData.get(`active_${weekday}`) === "on";
    const start = String(formData.get(`start_${weekday}`) ?? "09:00");
    const end = String(formData.get(`end_${weekday}`) ?? "18:00");

    if (enabled) {
      rows.push({
        profile_id: profile.id,
        weekday,
        start_time: start,
        end_time: end,
        is_active: true,
      });
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error: deleteError } = await supabase
    .from("availability_rules")
    .delete()
    .eq("profile_id", profile.id);

  if (deleteError) {
    logError("Failed to replace availability rules", { profileId: profile.id, error: deleteError });
    return { success: false, message: "Не получилось обновить старый график." };
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("availability_rules")
      .insert(rows);

    if (insertError) {
      logError("Failed to insert availability rules", { profileId: profile.id, error: insertError });
      return { success: false, message: "Не получилось сохранить рабочие дни." };
    }
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "availability.updated",
    targetType: "availability",
    targetId: profile.id,
    metadata: {
      activeDays: rows.map((row) => row.weekday),
      activeCount: rows.length,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/schedule");
  return { success: true, message: "График работы сохранен." };
}

export async function createBlockedSlotAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для ручных блокировок нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = blockedSlotSchema.safeParse({
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Укажи дату, время начала и время окончания блокировки.",
    };
  }

  const startsAt = DateTime.fromISO(
    `${parsed.data.date}T${parsed.data.startTime}`,
    { zone: profile.timezone },
  );
  const endsAt = DateTime.fromISO(
    `${parsed.data.date}T${parsed.data.endTime}`,
    { zone: profile.timezone },
  );

  if (!startsAt.isValid || !endsAt.isValid || endsAt <= startsAt) {
    return {
      success: false,
      message: "Проверь диапазон времени: окончание должно быть позже начала.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("blocked_slots").insert({
    profile_id: profile.id,
    starts_at: startsAt.toUTC().toISO(),
    ends_at: endsAt.toUTC().toISO(),
    reason: parsed.data.reason || "Ручная блокировка",
  });

  if (error) {
    logError("Failed to create blocked slot", { profileId: profile.id, error });
    return {
      success: false,
      message: `Не получилось сохранить блокировку.${error.message ? ` ${error.message}` : ""}`,
    };
  }

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath(`/${profile.username}`);
  revalidatePath(`/${profile.username}/book`);

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "blocked_slot.created",
    targetType: "blocked_slot",
    targetId: `${parsed.data.date}:${parsed.data.startTime}-${parsed.data.endTime}`,
    metadata: {
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
    },
  });

  return {
    success: true,
    message: "Время заблокировано. Клиенты больше не увидят этот слот.",
  };
}

export async function deleteBlockedSlotAction(formData: FormData) {
  if (!isSupabaseConfigured) {
    return;
  }

  const profile = await requireProfile();
  if (!profile) {
    return;
  }

  const blockedSlotId = String(formData.get("blockedSlotId") ?? "");
  if (!blockedSlotId) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("blocked_slots")
    .delete()
    .eq("id", blockedSlotId)
    .eq("profile_id", profile.id);

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "blocked_slot.deleted",
    targetType: "blocked_slot",
    targetId: blockedSlotId,
  });

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath(`/${profile.username}`);
  revalidatePath(`/${profile.username}/book`);
}
