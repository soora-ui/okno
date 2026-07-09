import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { referralBonusDays } from "@/lib/referral";
import { logError } from "@/lib/observability/logger";
import { writeAuditLog } from "@/lib/observability/audit";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";

// Серверная часть реферальной программы (использует Supabase admin-клиент и
// server-only логирование) — держим отдельно от src/lib/referral.ts, чтобы
// последний оставался безопасным для импорта из клиентских компонентов.

// Вызывается вебхуком ЮKassa сразу после того, как первая оплата PRO
// приглашённым мастером подтверждена (см.
// src/app/api/payments/yookassa/webhook/route.ts). Начисляет бонус
// пригласившему: +referralBonusDays к его subscription_until, той же
// логикой продления, что и обычная оплата. Идемпотентно — уникальный индекс
// referral_rewards.referred_profile_id и проверка status="pending" не дают
// начислить бонус дважды за одного реферала.
export async function applyReferralRewardForFirstPayment(
  supabase: SupabaseClient,
  input: { referredProfileId: string },
): Promise<void> {
  try {
    const { data: rewardRow, error: rewardError } = await supabase
      .from("referral_rewards")
      .select("id, referrer_profile_id, status")
      .eq("referred_profile_id", input.referredProfileId)
      .maybeSingle();

    if (rewardError) {
      if (isSupabaseMissingTableError(rewardError, "referral_rewards")) {
        return;
      }
      logError("Referral: failed to load reward row", {
        referredProfileId: input.referredProfileId,
        error: rewardError,
      });
      return;
    }

    if (!rewardRow || rewardRow.status === "applied") {
      // Нет реферала у этого мастера, либо бонус уже был начислен раньше
      // (например, повторное уведомление вебхука).
      return;
    }

    const { data: referrerProfile, error: referrerError } = await supabase
      .from("profiles")
      .select("id, subscription_tier, subscription_until")
      .eq("id", rewardRow.referrer_profile_id)
      .maybeSingle();

    if (referrerError || !referrerProfile) {
      logError("Referral: failed to load referrer profile", {
        referrerProfileId: rewardRow.referrer_profile_id,
        error: referrerError,
      });
      return;
    }

    // Продлеваем от большей из двух дат: "сейчас" или уже оплаченного
    // окончания подписки — так же, как обычно ожидает пользователь продление.
    const currentUntil = referrerProfile.subscription_until
      ? DateTime.fromISO(String(referrerProfile.subscription_until))
      : null;
    const base =
      currentUntil && currentUntil > DateTime.now() ? currentUntil : DateTime.now();
    const newUntil = base.plus({ days: referralBonusDays }).toUTC().toISO();

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        subscription_tier: "pro",
        subscription_until: newUntil,
      })
      .eq("id", rewardRow.referrer_profile_id);

    if (updateError) {
      logError("Referral: failed to extend referrer subscription", {
        referrerProfileId: rewardRow.referrer_profile_id,
        error: updateError,
      });
      return;
    }

    await supabase
      .from("referral_rewards")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", rewardRow.id)
      .eq("status", "pending");

    await writeAuditLog({
      actorKind: "system",
      profileId: rewardRow.referrer_profile_id,
      eventType: "referral.reward.applied",
      targetType: "referral_reward",
      targetId: rewardRow.id,
      metadata: {
        referredProfileId: input.referredProfileId,
        bonusDays: referralBonusDays,
        until: newUntil,
      },
    });
  } catch (error) {
    logError("Referral: unexpected error applying reward", {
      referredProfileId: input.referredProfileId,
      error,
    });
  }
}
