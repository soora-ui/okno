"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import {
  deleteMasterYooKassaWebhooks,
  getMasterYooKassaTokenForRevoke,
  markMasterYooKassaAccountRevoked,
  revokeYooKassaTokenRemote,
} from "@/lib/payments/yookassa-oauth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type YooKassaOAuthActionState = {
  success: boolean;
  message: string;
};

// Отключение мастером своего аккаунта ЮKassa (okno-tz-yookassa-oauth.md,
// «Отключить»). Сбрасывает предоплату на всех услугах мастера — без
// подключенной ЮKassa настроить предоплату нельзя (см. валидацию в
// createServiceAction/updateServiceAction), поэтому оставлять старые
// значения prepayment_type смысла нет.
export async function revokeYooKassaAccountAction(
  _prevState: YooKassaOAuthActionState,
  _formData: FormData,
): Promise<YooKassaOAuthActionState> {
  // useActionState всегда передаёт (prevState, formData); кнопке отключения
  // они не нужны — профиль берётся из текущей сессии.
  void _formData;

  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для отключения ЮKassa нужно подключение к Supabase.",
    };
  }

  const authProfile = await getCurrentAuthProfile();
  if (!authProfile || authProfile.source !== "supabase") {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const profile = authProfile.profile;
  // Сервисный клиент: master_yookassa_accounts закрыта от записи под сессией
  // мастера (миграция 202611100001); все запросы ниже — по profile.id из сессии.
  const supabase = createSupabaseAdminClient();

  // Токен берём независимо от статуса: подключение, не добравшееся до
  // 'enabled' (не завелись вебхуки), тоже надо отозвать у ЮKassa.
  const token = await getMasterYooKassaTokenForRevoke(supabase, profile.id);
  if (token) {
    // Сначала подписки, потом токен: после отзыва удалять их уже нечем.
    await deleteMasterYooKassaWebhooks(token.accessToken, token.webhooks);
    await revokeYooKassaTokenRemote(token.accessToken);
  }

  await markMasterYooKassaAccountRevoked(supabase, profile.id);

  const { error: servicesError } = await supabase
    .from("services")
    .update({ prepayment_type: "none", prepayment_value: 0 })
    .eq("profile_id", profile.id);

  if (servicesError) {
    logError("Failed to reset services prepayment after YooKassa revoke", {
      profileId: profile.id,
      error: servicesError,
    });
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    eventType: "yookassa_oauth.revoked",
    targetType: "master_yookassa_account",
  });

  revalidatePath("/settings");
  return { success: true, message: "ЮKassa отключена. Предоплата на услугах выключена." };
}
