"use server";

import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { freeWindowsDaysAhead } from "@/lib/free-windows";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import {
  hotWindowsDiscountUntilIso,
  maxDiscountPercent,
  type HotWindowsDiscount,
} from "@/lib/service-discounts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canManageWorkspace, isTeamWorkspaceKind } from "@/lib/workspace";

export type HotWindowsDiscountActionResult =
  | { success: true; discount: HotWindowsDiscount | null }
  | { success: false; message: string };

const percentSchema = z.number().int().min(0).max(maxDiscountPercent);
const memberIdSchema = z.string().uuid().nullable();

// Скидка на горящие окошки из окна сторис: действует на визиты в те же три
// дня, что на картинке, — до конца последнего из них. 0 — выключить.
// memberId — админ студии включает скидку выбранному мастеру своей студии:
// записи идут к мастеру, и скидку при записи читают из его профиля.
export async function setHotWindowsDiscountAction(
  percent: number,
  memberId: string | null = null,
): Promise<HotWindowsDiscountActionResult> {
  const parsed = percentSchema.safeParse(percent);
  if (!parsed.success) {
    return { success: false, message: `Скидка — от 1 до ${maxDiscountPercent}%.` };
  }

  if (!isSupabaseConfigured) {
    return { success: false, message: "Для скидки нужно подключение к Supabase." };
  }

  const authProfile = await getCurrentAuthProfile();
  if (!authProfile || authProfile.source !== "supabase") {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsedMemberId = memberIdSchema.safeParse(memberId);
  if (!parsedMemberId.success) {
    return { success: false, message: "Не нашли мастера." };
  }

  const actor = authProfile.profile;
  const isTeamAdmin =
    canManageWorkspace(actor.accountRole) && isTeamWorkspaceKind(actor.workspaceKind);

  // Свою скидку ставит мастер или сотрудник студии. У админа студии своей
  // страницы с расписанием нет — только скидка выбранному мастеру.
  if (!parsedMemberId.data && isTeamAdmin) {
    return { success: false, message: "Выберите мастера студии." };
  }
  if (parsedMemberId.data && (!isTeamAdmin || !actor.workspaceId)) {
    return { success: false, message: "Скидку мастеру включает администратор студии." };
  }

  let profile = actor;
  if (parsedMemberId.data && parsedMemberId.data !== actor.id) {
    // Мастер обязан быть из той же студии: иначе админ мог бы включить скидку
    // в чужом кабинете, подставив id.
    const { data: memberRow, error: memberError } = await createSupabaseAdminClient()
      .from("profiles")
      .select("id, username, timezone, workspace_id")
      .eq("id", parsedMemberId.data)
      .eq("workspace_id", actor.workspaceId)
      .maybeSingle();
    if (memberError || !memberRow) {
      return { success: false, message: "Не нашли мастера в вашей студии." };
    }
    profile = {
      ...actor,
      id: String(memberRow.id),
      username: String(memberRow.username ?? ""),
      timezone: String(memberRow.timezone ?? actor.timezone),
    };
  }

  const discount: HotWindowsDiscount | null =
    parsed.data > 0
      ? {
          percent: parsed.data,
          untilIso: hotWindowsDiscountUntilIso(
            DateTime.now()
              .setZone(profile.timezone)
              .plus({ days: freeWindowsDaysAhead - 1 })
              .toISODate() ?? "",
            profile.timezone,
          ),
        }
      : null;

  // Профиль сотрудника админ под своей сессией менять не может (RLS) —
  // для него сервисный клиент, принадлежность к студии проверена выше.
  const supabase =
    profile.id === actor.id ? await createSupabaseServerClient() : createSupabaseAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      hot_windows_discount_percent: discount?.percent ?? null,
      hot_windows_discount_until: discount?.untilIso ?? null,
    })
    .eq("id", profile.id);

  if (error) {
    logError("Failed to set hot windows discount", { profileId: profile.id, error });
    return { success: false, message: "Не получилось сохранить скидку." };
  }

  await writeAuditLog({
    eventType: discount ? "hot_windows_discount.enabled" : "hot_windows_discount.disabled",
    actorKind: "master",
    actorProfileId: actor.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    targetType: "profile",
    targetId: profile.id,
    metadata: discount ? { percent: discount.percent, untilIso: discount.untilIso } : {},
  });

  revalidatePath("/dashboard");
  revalidatePath("/team");
  revalidatePath(`/${profile.username}`);
  revalidatePath(`/${profile.username}/book`);

  return { success: true, discount };
}
