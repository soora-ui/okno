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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTeamWorkspaceKind } from "@/lib/workspace";

export type HotWindowsDiscountActionResult =
  | { success: true; discount: HotWindowsDiscount | null }
  | { success: false; message: string };

const percentSchema = z.number().int().min(0).max(maxDiscountPercent);

// Скидка на горящие окошки из окна сторис: действует на визиты в те же три
// дня, что на картинке, — до конца последнего из них. 0 — выключить.
export async function setHotWindowsDiscountAction(
  percent: number,
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

  const { profile } = authProfile;
  // Горящие окошки — только у мастера-одиночки (см. free-windows-data.ts).
  if (isTeamWorkspaceKind(profile.workspaceKind)) {
    return { success: false, message: "Горящие окошки пока только для личной страницы." };
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

  const supabase = await createSupabaseServerClient();
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
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    targetType: "profile",
    targetId: profile.id,
    metadata: discount ? { percent: discount.percent, untilIso: discount.untilIso } : {},
  });

  revalidatePath("/dashboard");
  revalidatePath(`/${profile.username}`);
  revalidatePath(`/${profile.username}/book`);

  return { success: true, discount };
}
