"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { deliverFeedbackReply } from "@/lib/feedback/service";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatSubscriptionUntil } from "@/lib/subscription";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminActionState = {
  success: boolean;
  message: string;
};

const grantSchema = z.object({
  email: z.string().trim().email(),
  duration: z.enum(["30", "90", "365", "lifetime"]),
});

const revokeSchema = z.object({
  email: z.string().trim().email(),
});

function durationDays(value: string): number | null {
  return value === "lifetime" ? null : Number(value);
}

// Находит профиль мастера по почте (без учёта регистра).
async function findProfileByEmail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_tier, subscription_until, workspace_id")
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as
    | {
        id: string;
        email: string;
        full_name: string | null;
        workspace_id: string | null;
      }
    | null;
}

export async function grantProAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();

  if (!isSupabaseConfigured) {
    return { success: false, message: "Рабочий контур Supabase не настроен." };
  }

  const parsed = grantSchema.safeParse({
    email: formData.get("email"),
    duration: formData.get("duration"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Проверь почту и срок подписки.",
    };
  }

  const supabase = createSupabaseAdminClient();

  let profile: Awaited<ReturnType<typeof findProfileByEmail>>;
  try {
    profile = await findProfileByEmail(supabase, parsed.data.email);
  } catch (error) {
    logError("Admin: failed to look up profile by email", { error });
    return { success: false, message: "Не получилось найти мастера." };
  }

  if (!profile) {
    return {
      success: false,
      message: `Мастер с почтой ${parsed.data.email} не найден.`,
    };
  }

  const days = durationDays(parsed.data.duration);
  const subscriptionUntil =
    days === null ? null : DateTime.now().plus({ days }).toUTC().toISO();

  // Ручная выдача из админки даёт максимальный тариф: она нужна для поддержки
  // и компенсаций, и урезанный доступ в этой роли только плодит обращения.
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ subscription_tier: "studio", subscription_until: subscriptionUntil })
    .eq("id", profile.id);

  if (updateError) {
    logError("Admin: failed to grant PRO", {
      profileId: profile.id,
      error: updateError,
    });
    return { success: false, message: "Не получилось выдать PRO." };
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: admin.id,
    profileId: profile.id,
    workspaceId: profile.workspace_id,
    eventType: "admin.pro.granted",
    targetType: "profile",
    targetId: profile.id,
    metadata: { duration: parsed.data.duration, until: subscriptionUntil },
  });

  revalidatePath("/admin");

  const untilLabel = subscriptionUntil
    ? `до ${formatSubscriptionUntil(subscriptionUntil)}`
    : "бессрочно";

  return {
    success: true,
    message: `PRO выдан мастеру ${profile.email} (${untilLabel}).`,
  };
}

export async function revokeProAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();

  if (!isSupabaseConfigured) {
    return { success: false, message: "Рабочий контур Supabase не настроен." };
  }

  const parsed = revokeSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { success: false, message: "Проверь почту." };
  }

  const supabase = createSupabaseAdminClient();

  let profile: Awaited<ReturnType<typeof findProfileByEmail>>;
  try {
    profile = await findProfileByEmail(supabase, parsed.data.email);
  } catch (error) {
    logError("Admin: failed to look up profile by email", { error });
    return { success: false, message: "Не получилось найти мастера." };
  }

  if (!profile) {
    return {
      success: false,
      message: `Мастер с почтой ${parsed.data.email} не найден.`,
    };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ subscription_tier: "free", subscription_until: null })
    .eq("id", profile.id);

  if (updateError) {
    logError("Admin: failed to revoke PRO", {
      profileId: profile.id,
      error: updateError,
    });
    return { success: false, message: "Не получилось снять PRO." };
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: admin.id,
    profileId: profile.id,
    workspaceId: profile.workspace_id,
    eventType: "admin.pro.revoked",
    targetType: "profile",
    targetId: profile.id,
  });

  revalidatePath("/admin");

  return {
    success: true,
    message: `PRO снят у мастера ${profile.email}.`,
  };
}

// Кнопка «Решено» закрывает всю группу, а не одну строку: у поломки, которая
// повторилась сорок раз, закрывать по одной записи бессмысленно. Список id
// приходит из той же выборки, которую показывает панель.
export async function resolveErrorGroupAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const raw = formData.get("ids");
  if (typeof raw !== "string" || !raw) {
    return;
  }

  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => UUID_PATTERN.test(id));

  if (ids.length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("error_events")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    logError("Admin: failed to resolve error group", { count: ids.length, error });
  }

  revalidatePath("/admin/errors");
  revalidatePath("/admin");
}

const feedbackUpdateSchema = z.object({
  id: z.string().regex(UUID_PATTERN),
  status: z.enum(["new", "planned", "done", "declined"]),
  reply: z.string().trim().max(2000).optional(),
  notify: z.literal("on").optional(),
});

// Разбор обратной связи: статус и, по желанию, ответ мастеру. Ответ уходит в
// Telegram, а если бота нет — ждёт мастера на странице «Идеи и проблемы».
export async function updateFeedbackAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requirePlatformAdmin();

  const parsed = feedbackUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    reply: formData.get("reply") || undefined,
    notify: formData.get("notify") || undefined,
  });

  if (!parsed.success) {
    return { success: false, message: "Проверь форму." };
  }

  const { id, status, reply, notify } = parsed.data;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("master_feedback")
    .update({
      status,
      ...(reply ? { admin_reply: reply } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    logError("Admin: feedback update failed", { id, error });
    return { success: false, message: "Не получилось сохранить." };
  }

  let message = "Сохранено.";

  if (notify && reply) {
    const channel = await deliverFeedbackReply({ feedbackId: id, reply, status });
    message =
      channel === "telegram"
        ? "Сохранено, ответ ушёл мастеру в Telegram."
        : channel === "site"
          ? "Сохранено. Telegram у мастера не подключён — ответ ждёт его в кабинете."
          : "Сохранено, но ответ отправить не получилось.";
  }

  revalidatePath("/admin/feedback");
  return { success: true, message };
}
