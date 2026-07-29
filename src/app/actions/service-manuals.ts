"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import {
  manualMaxLength,
  manualMinLength,
  serviceManualFormSchema,
} from "@/lib/service-manuals";
import { hasCapability } from "@/lib/subscription";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServiceManualActionState = {
  success: boolean;
  message: string;
};

async function requireProfile() {
  if (!isSupabaseConfigured) return null;

  const authProfile = await getCurrentAuthProfile();

  return authProfile?.profile ?? null;
}

const migrationHint =
  "В базе ещё нет таблицы мануалов. Прогони миграцию 202606180001_service_manuals.sql и попробуй ещё раз.";

// Сохранение мануала — только подтверждённое: мастер ставит галочку
// ответственности, и текст сразу становится активной версией. Версии
// накапливаются (append-only), активной остаётся одна — её и будет
// использовать бот на следующих этапах.
export async function saveServiceManualAction(
  _prevState: ServiceManualActionState,
  formData: FormData,
): Promise<ServiceManualActionState> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для сохранения мануала нужно подключение к Supabase.",
    };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  // Гейт на сервере, а не только в интерфейсе: редактор мануала спрятан для
  // тарифов без AI-консультации, но сам server action до этого можно было
  // вызвать напрямую и сохранить мануал в обход тарифа.
  if (!hasCapability(profile, "aiConsultation")) {
    return {
      success: false,
      message:
        "AI-консультация входит в тарифы «Соло. Расширенный» и «Студия и барбершоп». Подключить можно в настройках, вкладка «Аккаунт».",
    };
  }

  const confirmed = formData.get("confirmed") === "on";
  if (!confirmed) {
    return {
      success: false,
      message:
        "Поставь галочку: подтверди, что мануал верен и ты несёшь ответственность за его содержание.",
    };
  }

  const parsed = serviceManualFormSchema.safeParse({
    serviceId: String(formData.get("serviceId") ?? ""),
    content: String(formData.get("content") ?? ""),
    confirmed: confirmed ? "on" : "off",
  });

  if (!parsed.success) {
    return {
      success: false,
      message: `Мануал должен быть от ${manualMinLength} до ${manualMaxLength} символов.`,
    };
  }

  const { serviceId, content } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (serviceError) {
    logError("Failed to verify service for manual", {
      profileId: profile.id,
      serviceId,
      error: serviceError,
    });
    return { success: false, message: "Не получилось проверить услугу." };
  }

  if (!service) {
    return { success: false, message: "Услуга не найдена." };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("service_manuals")
    .select("id, content, version, is_active")
    .eq("service_id", serviceId)
    .order("version", { ascending: false });

  if (existingError) {
    if (isSupabaseMissingTableError(existingError, "service_manuals")) {
      return { success: false, message: migrationHint };
    }
    logError("Failed to read existing manuals", {
      profileId: profile.id,
      serviceId,
      error: existingError,
    });
    return { success: false, message: "Не получилось загрузить мануал." };
  }

  const rows = existingRows ?? [];
  const activeRow = rows.find((row) => row.is_active);
  const maxVersion = rows.reduce(
    (max, row) => Math.max(max, Number(row.version ?? 0)),
    0,
  );

  if (activeRow && String(activeRow.content ?? "").trim() === content) {
    return {
      success: true,
      message: `Мануал уже подтверждён (версия ${activeRow.version}). Изменений нет.`,
    };
  }

  const nextVersion = maxVersion + 1;

  if (activeRow) {
    const { error: deactivateError } = await supabase
      .from("service_manuals")
      .update({ is_active: false })
      .eq("service_id", serviceId)
      .eq("is_active", true);

    if (deactivateError) {
      logError("Failed to deactivate previous manual", {
        profileId: profile.id,
        serviceId,
        error: deactivateError,
      });
      return { success: false, message: "Не получилось обновить мануал." };
    }
  }

  const confirmedAt = new Date().toISOString();
  const { error: insertError } = await supabase.from("service_manuals").insert({
    service_id: serviceId,
    profile_id: profile.id,
    content,
    version: nextVersion,
    is_active: true,
    confirmed_by_master_at: confirmedAt,
    updated_at: confirmedAt,
  });

  if (insertError) {
    if (isSupabaseMissingTableError(insertError, "service_manuals")) {
      return { success: false, message: migrationHint };
    }
    logError("Failed to insert manual", {
      profileId: profile.id,
      serviceId,
      error: insertError,
    });
    return { success: false, message: "Не получилось сохранить мануал." };
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "service_manual.confirmed",
    targetType: "service",
    targetId: serviceId,
    metadata: {
      version: nextVersion,
      contentLength: content.length,
    },
  });

  revalidatePath("/settings");

  return {
    success: true,
    message: `Мануал подтверждён и сохранён (версия ${nextVersion}).`,
  };
}
