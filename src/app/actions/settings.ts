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
  giftCertificateSettingsFormSchema,
  headlineMaxLength,
  masterContactMaxLength,
  maxGiftCertificateDenominations,
  normalizeSocialHandle,
  parseMapLocation,
  socialNetworkMeta,
  socialNetworks,
  subheadlineMaxLength,
  type BookingPageSettings,
  type SocialLinks,
} from "@/lib/booking-page-settings";
import { getCurrentAuthProfile } from "@/lib/data";
import { getMasterYooKassaAccount } from "@/lib/payments/yookassa-oauth";
import { hasCapability } from "@/lib/subscription";
import { validatePrepaymentSetting } from "@/lib/prepayment";
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
import { validateServiceDiscountSettings } from "@/lib/service-discounts";

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
    masterContact: formData.get("masterContact") ?? "",
    showInCatalog: formData.get("showInCatalog") ?? "off",
  });
  if (!parsed.success) {
    return {
      success: false,
      message: `Проверь поля: заголовок до ${headlineMaxLength}, подзаголовок до ${subheadlineMaxLength}, контакт до ${masterContactMaxLength} символов.`,
    };
  }

  const nextSettings = {
    ...profile.bookingPageSettings,
    headline: parsed.data.headline,
    subheadline: parsed.data.subheadline,
    commentFieldMode: parsed.data.commentFieldMode,
    masterContact: parsed.data.masterContact,
    showInCatalog: parsed.data.showInCatalog,
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
      showInCatalog: parsed.data.showInCatalog,
    },
  });

  return {
    success: true,
    message: "Страница записи обновлена.",
  };
}

async function saveBookingPageSettingsPatch(
  profile: NonNullable<Awaited<ReturnType<typeof requireProfile>>>,
  patch: Partial<BookingPageSettings>,
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      booking_page_settings: { ...profile.bookingPageSettings, ...patch },
    })
    .eq("id", profile.id);

  if (!error) {
    revalidateProfilePaths(profile.username);
  }

  return error;
}

// Соцсети живут в booking_page_settings, отдельная колонка не нужна.
export async function updateSocialLinksAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Для сохранения нужно подключение к Supabase." };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const socialLinks = {} as SocialLinks;
  const invalid: string[] = [];
  for (const network of socialNetworks) {
    const raw = formData.get(network);
    const handle = normalizeSocialHandle(network, typeof raw === "string" ? raw : "");
    if (handle === null) {
      invalid.push(socialNetworkMeta[network].label);
      socialLinks[network] = "";
    } else {
      socialLinks[network] = handle;
    }
  }

  if (invalid.length > 0) {
    return {
      success: false,
      message: `Не получилось разобрать: ${invalid.join(", ")}. Укажи ник (например, @alina_nails) или ссылку на профиль.`,
    };
  }

  const error = await saveBookingPageSettingsPatch(profile, { socialLinks });
  if (error) {
    logError("Failed to update social links", { profileId: profile.id, error });
    return { success: false, message: "Не получилось сохранить соцсети. Попробуй ещё раз." };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "booking_page_settings.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: {
      socialNetworks: socialNetworks.filter((network) => socialLinks[network]),
    },
  });

  return { success: true, message: "Соцсети сохранены." };
}

// Точка на Яндекс Карте для публичной страницы. null — убрать карту.
export async function updateMapLocationAction(input: {
  lat: number;
  lon: number;
  zoom: number;
} | null): Promise<SettingsActionState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Для сохранения нужно подключение к Supabase." };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const mapLocation = input ? parseMapLocation(input) : null;
  if (input && !mapLocation) {
    return { success: false, message: "Не получилось распознать точку на карте." };
  }

  const error = await saveBookingPageSettingsPatch(profile, { mapLocation });
  if (error) {
    logError("Failed to update map location", { profileId: profile.id, error });
    return { success: false, message: "Не получилось сохранить точку на карте." };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "booking_page_settings.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: { hasMapLocation: Boolean(mapLocation) },
  });

  return {
    success: true,
    message: mapLocation ? "Точка на карте сохранена." : "Карта убрана со страницы.",
  };
}

// Вкл/выкл продажу подарочных сертификатов и номиналы. Живет в том же JSONB
// (booking_page_settings), поэтому отдельной миграции колонки не требуется —
// только миграция таблицы gift_certificates (202607090001).
export async function updateGiftCertificateSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для настройки сертификатов нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const denominationsRaw = formData
    .get("denominations")
    ?.toString()
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  const parsed = giftCertificateSettingsFormSchema.safeParse({
    denominations: denominationsRaw,
    noExpiry: formData.get("noExpiry") ?? "off",
    expiryDate: formData.get("expiryDate") ?? "",
  });

  if (!parsed.success) {
    const expiryIssue = parsed.error.issues.find((issue) => issue.path.includes("expiryDate"));
    return {
      success: false,
      message:
        expiryIssue?.message ??
        `Проверь номиналы: от 1 до ${maxGiftCertificateDenominations} значений, каждое в разумных пределах.`,
    };
  }

  const nextSettings = {
    ...profile.bookingPageSettings,
    giftCertificateDenominations: Array.from(new Set(parsed.data.denominations)).sort(
      (a, b) => a - b,
    ),
    giftCertificateNoExpiry: parsed.data.noExpiry,
    giftCertificateExpiryDate: parsed.data.noExpiry ? null : parsed.data.expiryDate || null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ booking_page_settings: nextSettings })
    .eq("id", profile.id);

  if (error) {
    if (isSupabaseMissingColumnError(error, "booking_page_settings")) {
      return {
        success: false,
        message:
          "В базе еще нет поля настроек страницы записи. Прогони миграцию 202604250001_booking_page_settings.sql и попробуй еще раз.",
      };
    }

    logError("Failed to update gift certificate settings", { profileId: profile.id, error });
    return {
      success: false,
      message: `Не получилось сохранить настройки сертификатов.${error.message ? ` ${error.message}` : ""}`,
    };
  }

  revalidateProfilePaths(profile.username);
  revalidatePath(`/${profile.username}/book`);

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "gift_certificate_settings.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: {
      denominations: nextSettings.giftCertificateDenominations,
    },
  });

  return {
    success: true,
    message: "Настройки сертификатов сохранены.",
  };
}

// Включение/выключение продажи сертификатов — отдельное действие от
// updateGiftCertificateSettingsAction (okno-tz-certificates-ui-flow.md,
// hard-gate). Мастер физически не может включить продажу без
// сгенерированного дизайна: фронтовый disabled-тумблер — это UX-подсказка,
// а настоящая защита — эта серверная проверка (иначе гейт обходится прямым
// запросом к экшену).
export async function updateCertificateSalesEnabledAction(input: { enabled: boolean }) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для настройки продажи сертификатов нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  if (input.enabled) {
    const admin = createSupabaseAdminClient();
    const { data: templateRow, error: templateError } = await admin
      .from("certificate_templates")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (templateError) {
      logError("Failed to check certificate template before enabling sales", {
        profileId: profile.id,
        error: templateError,
      });
      return { success: false, message: "Не получилось проверить дизайн сертификата." };
    }

    if (!templateRow) {
      return {
        success: false,
        message: "Нужен дизайн сертификата, чтобы включить продажу.",
      };
    }

    // Деньги за сертификат идут напрямую в магазин мастера через его
    // OAuth-токен (PRODUCT.md, «Деньги») — без подключения принимать их
    // некуда, и кнопка покупки на публичной странице была бы обманом.
    // Та же проверка, что у предоплаты в create/updateServiceAction.
    const yookassaAccount = await getMasterYooKassaAccount(admin, profile.id);
    if (!yookassaAccount || yookassaAccount.status !== "enabled") {
      return {
        success: false,
        message:
          "Сначала подключи ЮKassa во вкладке «Запись», потом можно включить продажу сертификатов.",
      };
    }
  }

  const nextSettings = {
    ...profile.bookingPageSettings,
    giftCertificatesEnabled: input.enabled,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ booking_page_settings: nextSettings })
    .eq("id", profile.id);

  if (error) {
    logError("Failed to update certificate sales enabled flag", { profileId: profile.id, error });
    return {
      success: false,
      message: `Не получилось сохранить настройку.${error.message ? ` ${error.message}` : ""}`,
    };
  }

  revalidateProfilePaths(profile.username);
  revalidatePath(`/${profile.username}/book`);

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "gift_certificate_sales.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: { enabled: input.enabled },
  });

  return {
    success: true,
    message: input.enabled ? "Продажа сертификатов включена." : "Продажа сертификатов выключена.",
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

  const { data: updatedAuth, error: authError } = await supabase.auth.updateUser(updatePayload);
  if (authError) {
    logError("Failed to update auth access", { profileId: profile.id, error: authError });
    return {
      success: false,
      message: "Не получилось обновить доступ к аккаунту.",
    };
  }

  // Адрес в профиле меняем, только когда его уже принял Supabase Auth. Если
  // включено подтверждение по письму, updateUser оставляет старый адрес, а
  // новый ждёт перехода по ссылке — тогда профиль не трогаем: он догонит
  // учётную запись сам при первой загрузке кабинета после подтверждения
  // (syncProfileEmailWithAuth в owner-repository.ts). Раньше профиль менялся
  // сразу, и в нём оказывался адрес, который никто не подтверждал.
  const confirmedEmail = updatedAuth.user?.email?.trim().toLowerCase() ?? "";
  const emailAwaitsConfirmation =
    emailChanged && confirmedEmail !== parsed.data.email.trim().toLowerCase();

  if (emailChanged && !emailAwaitsConfirmation) {
    // Под сессией мастера email не редактируется (миграция 202611100001):
    // по нему определяется админ платформы. Пишем сервисным клиентом.
    const { error: profileError } = await createSupabaseAdminClient()
      .from("profiles")
      .update({ email: confirmedEmail })
      .eq("id", profile.id);

    if (profileError) {
      logError("Auth updated but profile email sync failed", { profileId: profile.id, error: profileError });
      return {
        success: false,
        message: "Данные входа обновились частично. Проверь email позже.",
      };
    }
  }

  revalidatePath("/settings");
  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "account.access.updated",
    targetType: "profile",
    targetId: profile.id,
    metadata: {
      emailChanged,
      emailAwaitsConfirmation,
      passwordChanged,
    },
  });

  if (emailAwaitsConfirmation) {
    return {
      success: true,
      message: passwordChanged
        ? "Пароль обновлён. На новый адрес отправлено письмо — email сменится после перехода по ссылке из него."
        : "На новый адрес отправлено письмо. Email сменится после перехода по ссылке из него, до этого вход по прежнему адресу.",
    };
  }

  return { success: true, message: "Данные входа обновлены." };
}

const optionalWholeNumber = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? null : value),
  z.coerce.number().int().nullable(),
);

const optionalIsoDate = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
);

const serviceSchema = z.object({
  title: z.string().min(2),
  description: z.string().default(""),
  durationMinutes: z.coerce.number().min(5).max(480),
  price: z.coerce.number().min(0),
  sortOrder: z.coerce.number().min(0).default(0),
  // Пусто/0 — срок повторного визита не задан: ни напоминания клиенту, ни
  // предложения записаться повторно от AI-консультанта не будет.
  repeatIntervalDays: z.coerce.number().min(0).max(364).default(0),
  // Перерыв после визита на эту услугу (раньше был один на мастера).
  bufferMinutes: z.coerce.number().min(0).max(180).default(0),
  prepaymentType: z.enum(["none", "fixed", "percent"]).default("none"),
  prepaymentValue: z.coerce.number().min(0).default(0),
  // Скидки (src/lib/service-discounts.ts). Пустое поле — скидки нет.
  discountPercent: optionalWholeNumber,
  discountStartsOn: optionalIsoDate,
  discountEndsOn: optionalIsoDate,
  firstVisitDiscountPercent: optionalWholeNumber,
});

function serviceDiscountColumns(data: z.infer<typeof serviceSchema>) {
  const hasPeriodDiscount = data.discountPercent !== null;
  return {
    discount_percent: data.discountPercent,
    discount_starts_on: hasPeriodDiscount ? data.discountStartsOn : null,
    discount_ends_on: hasPeriodDiscount ? data.discountEndsOn : null,
    first_visit_discount_percent: data.firstVisitDiscountPercent,
  };
}

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

  const prepaymentCheck = validatePrepaymentSetting({
    prepaymentType: parsed.data.prepaymentType,
    prepaymentValue: parsed.data.prepaymentValue,
    servicePrice: parsed.data.price,
  });
  if (!prepaymentCheck.ok) {
    return { success: false, message: prepaymentCheck.message };
  }

  const discountCheck = validateServiceDiscountSettings(parsed.data);
  if (!discountCheck.ok) {
    return { success: false, message: discountCheck.message };
  }

  const supabase = await createSupabaseServerClient();

  if (parsed.data.prepaymentType !== "none") {
    // Гейт тарифа проверяем до магазина: предоплата входит в «Соло.
    // Расширенный» и «Студия», а форму можно отправить и в обход интерфейса.
    if (!hasCapability(profile, "prepayment")) {
      return {
        success: false,
        message:
          "Предоплата входит в тарифы «Соло. Расширенный» и «Студия и барбершоп». Подключить можно во вкладке «Аккаунт».",
      };
    }

    const yookassaAccount = await getMasterYooKassaAccount(supabase, profile.id);
    if (!yookassaAccount || yookassaAccount.status !== "enabled") {
      return {
        success: false,
        message: "Сначала подключи ЮKassa во вкладке «Запись», потом можно включить предоплату.",
      };
    }
  }

  const { error } = await supabase.from("services").insert({
    profile_id: profile.id,
    title: parsed.data.title,
    description: parsed.data.description,
    duration_minutes: parsed.data.durationMinutes,
    price: parsed.data.price,
    sort_order: parsed.data.sortOrder,
    is_active: true,
    repeat_interval_days: parsed.data.repeatIntervalDays > 0
      ? parsed.data.repeatIntervalDays
      : null,
    buffer_minutes: parsed.data.bufferMinutes,
    prepayment_type: parsed.data.prepaymentType,
    prepayment_value: parsed.data.prepaymentValue,
    ...serviceDiscountColumns(parsed.data),
  });

  if (error) {
    if (isSupabaseMissingColumnError(error, "discount_percent")) {
      return {
        success: false,
        message:
          "В базе еще нет полей скидок. Прогони миграцию 202610210001_service_discounts.sql и попробуй еще раз.",
      };
    }

    if (isSupabaseMissingColumnError(error, "prepayment_type")) {
      return {
        success: false,
        message:
          "В базе еще нет полей предоплаты. Прогони миграцию 202607090002_service_prepayment.sql и попробуй еще раз.",
      };
    }

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
      prepaymentType: parsed.data.prepaymentType,
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

  const prepaymentCheck = validatePrepaymentSetting({
    prepaymentType: parsed.data.prepaymentType,
    prepaymentValue: parsed.data.prepaymentValue,
    servicePrice: parsed.data.price,
  });
  if (!prepaymentCheck.ok) {
    return { success: false, message: prepaymentCheck.message };
  }

  const discountCheck = validateServiceDiscountSettings(parsed.data);
  if (!discountCheck.ok) {
    return { success: false, message: discountCheck.message };
  }

  const visibilityAction = String(formData.get("visibilityAction") ?? "");
  const nextActive =
    visibilityAction === "hide"
      ? false
      : visibilityAction === "show"
        ? true
        : formData.get("isActive") === "on";

  const supabase = await createSupabaseServerClient();

  if (parsed.data.prepaymentType !== "none") {
    // Гейт тарифа проверяем до магазина: предоплата входит в «Соло.
    // Расширенный» и «Студия», а форму можно отправить и в обход интерфейса.
    if (!hasCapability(profile, "prepayment")) {
      return {
        success: false,
        message:
          "Предоплата входит в тарифы «Соло. Расширенный» и «Студия и барбершоп». Подключить можно во вкладке «Аккаунт».",
      };
    }

    const yookassaAccount = await getMasterYooKassaAccount(supabase, profile.id);
    if (!yookassaAccount || yookassaAccount.status !== "enabled") {
      return {
        success: false,
        message: "Сначала подключи ЮKassa во вкладке «Запись», потом можно включить предоплату.",
      };
    }
  }

  const { error } = await supabase
    .from("services")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      duration_minutes: parsed.data.durationMinutes,
      price: parsed.data.price,
      sort_order: parsed.data.sortOrder,
      is_active: nextActive,
      repeat_interval_days: parsed.data.repeatIntervalDays > 0
        ? parsed.data.repeatIntervalDays
        : null,
      buffer_minutes: parsed.data.bufferMinutes,
      prepayment_type: parsed.data.prepaymentType,
      prepayment_value: parsed.data.prepaymentValue,
      ...serviceDiscountColumns(parsed.data),
    })
    .eq("id", serviceId)
    .eq("profile_id", profile.id);

  if (error) {
    if (isSupabaseMissingColumnError(error, "discount_percent")) {
      return {
        success: false,
        message:
          "В базе еще нет полей скидок. Прогони миграцию 202610210001_service_discounts.sql и попробуй еще раз.",
      };
    }

    if (isSupabaseMissingColumnError(error, "prepayment_type")) {
      return {
        success: false,
        message:
          "В базе еще нет полей предоплаты. Прогони миграцию 202607090002_service_prepayment.sql и попробуй еще раз.",
      };
    }

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
      prepaymentType: parsed.data.prepaymentType,
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
