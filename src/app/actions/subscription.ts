"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getCurrentAuthProfile } from "@/lib/data";
import { env, isSupabaseConfigured, isYooKassaConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createYooKassaPayment } from "@/lib/payments/yookassa";
import { planPeriodDays } from "@/lib/subscription";
import {
  type PlanId,
  calculatePlanPriceRub,
  getPlan,
  isPlanId,
} from "@/config/plans";
import { countActiveWorkspaceSeats } from "@/lib/repositories/team-repository";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SubscriptionActionState = {
  success: boolean;
  message: string;
};

const migrationHint =
  "В базе ещё нет таблицы платежей. Прогони миграцию 202606180002_pro_subscription.sql и попробуй ещё раз.";

// Старт оплаты тарифа: создаём pending-платёж у себя и в ЮKassa, затем уводим
// мастера на страницу оплаты. Активирует тариф уже вебхук — после того как
// ЮKassa подтвердит успешную оплату.
export async function startProSubscriptionAction(
  _prevState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const requestedPlan = formData.get("planId");
  const planId: PlanId = isPlanId(requestedPlan) ? requestedPlan : "solo-basic";
  const plan = getPlan(planId);

  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для оплаты подписки нужно подключение к Supabase.",
    };
  }

  if (!isYooKassaConfigured) {
    return {
      success: false,
      message:
        "Оплата пока недоступна: не настроены тестовые ключи ЮKassa (YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY).",
    };
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile ?? null;
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const supabase = await createSupabaseServerClient();
  const idempotenceKey = randomUUID();

  // Доплата за сотрудников считается на момент оплаты: тариф «Студия» включает
  // три места, всё сверх — по 350 ₽. Количество берём из активных участников
  // рабочего пространства, чтобы мастер не оплатил меньше, чем занял.
  const activeSeats = await countActiveWorkspaceSeats(supabase, profile.workspaceId);
  const amountRub = calculatePlanPriceRub(planId, activeSeats);

  const { data: paymentRow, error: insertError } = await supabase
    .from("subscription_payments")
    .insert({
      profile_id: profile.id,
      provider: "yookassa",
      plan: planId,
      amount: amountRub,
      currency: "RUB",
      period_days: planPeriodDays,
      status: "pending",
      idempotence_key: idempotenceKey,
      metadata: { activeSeats, includedSeats: plan.includedSeats },
    })
    .select("id")
    .single();

  if (insertError || !paymentRow) {
    if (isSupabaseMissingTableError(insertError, "subscription_payments")) {
      return { success: false, message: migrationHint };
    }
    logError("Failed to create subscription payment row", {
      profileId: profile.id,
      error: insertError,
    });
    return { success: false, message: "Не получилось начать оплату." };
  }

  let confirmationUrl: string | null = null;

  try {
    const payment = await createYooKassaPayment({
      amountRub,
      description: `okno «${plan.title}» — подписка на ${planPeriodDays} дней`,
      returnUrl: `${env.appUrl}/settings?subscription=processing`,
      idempotenceKey,
      metadata: {
        profileId: profile.id,
        paymentRowId: paymentRow.id,
        plan: planId,
      },
    });

    confirmationUrl = payment.confirmationUrl;

    await supabase
      .from("subscription_payments")
      .update({
        provider_payment_id: payment.id,
        status: payment.status === "succeeded" ? "succeeded" : "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRow.id);
  } catch (error) {
    logError("Failed to create YooKassa payment", {
      profileId: profile.id,
      error,
    });
    await supabase
      .from("subscription_payments")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", paymentRow.id);
    return {
      success: false,
      message: "ЮKassa не приняла платёж. Проверь тестовые ключи и попробуй ещё раз.",
    };
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "subscription.payment.started",
    targetType: "subscription_payment",
    targetId: paymentRow.id,
    metadata: { plan: planId, amount: amountRub, activeSeats },
  });

  if (!confirmationUrl) {
    return {
      success: false,
      message: "ЮKassa не вернула ссылку на оплату. Попробуй ещё раз.",
    };
  }

  redirect(confirmationUrl);
}
