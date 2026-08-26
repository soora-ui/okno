"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAuthProfile } from "@/lib/data";
import { env, isSupabaseConfigured, isYooKassaConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createYooKassaPayment } from "@/lib/payments/yookassa";
import { detachSubscriptionPaymentMethod } from "@/lib/payments/subscription-autopay";
import {
  type BillingPeriodId,
  type PlanId,
  calculatePeriodPriceRub,
  defaultBillingPeriodId,
  getBillingPeriod,
  getPlan,
  isBillingPeriodId,
  isPlanId,
} from "@/config/plans";
import { countActiveWorkspaceSeats } from "@/lib/repositories/team-repository";
import { resolveSubscription } from "@/lib/subscription";
import { loadSeatBalance } from "@/lib/subscription-seats";
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
  // Период оплаты приходит с формы. Неизвестное значение — это подделанный или
  // устаревший запрос: берём месяц, самый дешёвый и самый короткий, чтобы
  // ошибка не стоила мастеру года вперёд.
  const requestedPeriod = formData.get("billingPeriod");
  const periodId: BillingPeriodId = isBillingPeriodId(requestedPeriod)
    ? requestedPeriod
    : defaultBillingPeriodId;
  const period = getBillingPeriod(periodId);
  // Автопродление включается только явной галочкой на форме оплаты: молча
  // привязывать карту нельзя. Отсутствие поля = согласия не было.
  const wantsAutopay = formData.get("autopay") === "on";

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
  const amountRub = calculatePeriodPriceRub(planId, periodId, activeSeats);

  const { data: paymentRow, error: insertError } = await supabase
    .from("subscription_payments")
    .insert({
      profile_id: profile.id,
      provider: "yookassa",
      kind: "subscription",
      plan: planId,
      amount: amountRub,
      currency: "RUB",
      period_days: period.days,
      status: "pending",
      idempotence_key: idempotenceKey,
      metadata: {
        activeSeats,
        includedSeats: plan.includedSeats,
        autopay: wantsAutopay,
        billingPeriod: periodId,
      },
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
      description: `okno «${plan.title}» — подписка на ${period.days} дней`,
      returnUrl: `${env.appUrl}/settings?subscription=processing`,
      idempotenceKey,
      savePaymentMethod: wantsAutopay,
      merchantCustomerId: profile.id,
      metadata: {
        profileId: profile.id,
        paymentRowId: paymentRow.id,
        plan: planId,
        autopay: wantsAutopay,
        periodDays: period.days,
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
    metadata: {
      plan: planId,
      amount: amountRub,
      activeSeats,
      autopay: wantsAutopay,
      periodDays: period.days,
    },
  });

  if (!confirmationUrl) {
    return {
      success: false,
      message: "ЮKassa не вернула ссылку на оплату. Попробуй ещё раз.",
    };
  }

  redirect(confirmationUrl);
}

// Доплата за сотрудников, добавленных посреди длинного оплаченного периода.
// Отдельный платёж, а не продление: срок подписки он не двигает, а закрывает
// места до конца уже оплаченного периода.
export async function startSeatTopUpAction(
  _prevState: SubscriptionActionState,
  _formData: FormData,
): Promise<SubscriptionActionState> {
  void _formData;

  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для оплаты мест нужно подключение к Supabase.",
    };
  }

  if (!isYooKassaConfigured) {
    return { success: false, message: "Оплата пока недоступна: не настроена ЮKassa." };
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile ?? null;
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const access = resolveSubscription(profile);
  const supabase = await createSupabaseServerClient();
  const balance = await loadSeatBalance(supabase, {
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    planId: access.planId,
    subscriptionUntil: access.activeUntil,
  });

  if (balance.unpaidSeats === 0 || balance.amountRub === 0) {
    return { success: true, message: "Все места уже оплачены до конца периода." };
  }

  const planId = access.planId;
  if (!planId) {
    return { success: false, message: "Сначала нужно оплатить тариф." };
  }

  const idempotenceKey = randomUUID();
  const { data: paymentRow, error: insertError } = await supabase
    .from("subscription_payments")
    .insert({
      profile_id: profile.id,
      provider: "yookassa",
      kind: "seat",
      plan: planId,
      amount: balance.amountRub,
      currency: "RUB",
      // Доплата не продлевает доступ — период у неё нулевой, и активация по
      // этому же признаку не трогает subscription_until.
      period_days: 0,
      status: "pending",
      idempotence_key: idempotenceKey,
      metadata: {
        seats: balance.unpaidSeats,
        activeSeats: balance.activeSeats,
        remainingDays: balance.remainingDays,
        periodDays: balance.periodDays,
      },
    })
    .select("id")
    .single();

  if (insertError || !paymentRow) {
    if (isSupabaseMissingTableError(insertError, "subscription_payments")) {
      return { success: false, message: migrationHint };
    }
    logError("Failed to create seat top-up payment row", {
      profileId: profile.id,
      error: insertError,
    });
    return { success: false, message: "Не получилось начать оплату." };
  }

  let confirmationUrl: string | null = null;

  try {
    const payment = await createYooKassaPayment({
      amountRub: balance.amountRub,
      description: `okno — ${balance.unpaidSeats} место(а) на ${balance.remainingDays} дней`,
      returnUrl: `${env.appUrl}/settings?subscription=processing`,
      idempotenceKey,
      merchantCustomerId: profile.id,
      metadata: {
        profileId: profile.id,
        paymentRowId: paymentRow.id,
        plan: planId,
        seats: balance.unpaidSeats,
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
    logError("Failed to create YooKassa seat top-up payment", {
      profileId: profile.id,
      error,
    });
    await supabase
      .from("subscription_payments")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", paymentRow.id);
    return { success: false, message: "ЮKassa не приняла платёж. Попробуй ещё раз." };
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "subscription.seats.payment.started",
    targetType: "subscription_payment",
    targetId: paymentRow.id,
    metadata: {
      seats: balance.unpaidSeats,
      amount: balance.amountRub,
      remainingDays: balance.remainingDays,
    },
  });

  if (!confirmationUrl) {
    return {
      success: false,
      message: "ЮKassa не вернула ссылку на оплату. Попробуй ещё раз.",
    };
  }

  redirect(confirmationUrl);
}

// Отключение автопродления и отвязка карты. Отвязать способ оплаты на стороне
// ЮKassa нельзя — метода в API нет, — поэтому «отвязка» означает: гасим
// привязку у себя и снимаем согласие. После этого списывать не с чего и
// незачем: job продления проверяет оба флага.
export async function disableSubscriptionAutopayAction(
  _prevState: SubscriptionActionState,
  _formData: FormData,
): Promise<SubscriptionActionState> {
  void _formData;

  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для управления автопродлением нужно подключение к Supabase.",
    };
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile ?? null;
  if (!profile || authProfile?.source !== "supabase") {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const supabase = await createSupabaseServerClient();
  const detached = await detachSubscriptionPaymentMethod(supabase, profile.id);

  if (!detached) {
    return {
      success: false,
      message: "Не получилось отключить автопродление. Попробуй ещё раз.",
    };
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "subscription.autopay.disabled",
    targetType: "profile",
    targetId: profile.id,
    metadata: { reason: "master_request" },
  });

  revalidatePath("/settings");
  return {
    success: true,
    message:
      "Автопродление отключено, карта отвязана. Оплаченный период доедет до конца — дальше продлевать нужно вручную.",
  };
}
