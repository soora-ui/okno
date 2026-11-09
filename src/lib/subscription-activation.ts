import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type PlanId, findBillingPeriodByDays, getPlan, isPlanId } from "@/config/plans";
import { queueNalogReceipt } from "@/lib/nalog/receipts";
import { notifySubscriptionAutopayCharged } from "@/lib/notifications";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError, logWarn } from "@/lib/observability/logger";
import { saveSubscriptionPaymentMethod } from "@/lib/payments/subscription-autopay";
import {
  getYooKassaPayment,
  type YooKassaPayment,
  type YooKassaStatus,
} from "@/lib/payments/yookassa";
import { applyReferralRewardForFirstPayment } from "@/lib/referral-rewards";
import { formatSubscriptionUntil, planPeriodDays } from "@/lib/subscription";
import { subscriptionPeriodDuration } from "@/lib/subscription-period";
import { registerFailedRenewal } from "@/lib/subscription-renewal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingColumnError } from "@/lib/supabase/auth-errors";

// Что делать с платежом за подписку, когда ЮKassa сообщила его исход.
//
// Живёт отдельно от вебхука, потому что путей сюда два. Основной — уведомление
// ЮKassa. Запасной — подборщик ниже: если уведомление не доехало, платёж
// навсегда остался бы pending, а мастер — без оплаченного доступа, при том что
// деньги списаны. Оба пути обязаны считать даты одинаково, поэтому расчёт
// здесь один и переиспользуется, а не копируется.

export const SUBSCRIPTION_PAYMENT_COLUMNS =
  "id, profile_id, provider_payment_id, period_days, status, plan, amount, kind, is_recurring, metadata, created_at";

// Оплата периода или доплата за места. Вторая денег стоит, но срок подписки не
// двигает — и признак этот должен читаться из строки платежа, а не угадываться
// по нулевому period_days.
export type SubscriptionPaymentKind = "subscription" | "seat";

export type SubscriptionPaymentRow = {
  id: string;
  profileId: string;
  providerPaymentId: string | null;
  periodDays: number;
  status: string;
  plan: unknown;
  amountRub: number;
  kind: SubscriptionPaymentKind;
  isRecurring: boolean;
  autopayRequested: boolean;
  metadata: Record<string, unknown> | null;
};

export function mapSubscriptionPaymentRow(
  row: Record<string, unknown>,
): SubscriptionPaymentRow {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    providerPaymentId:
      typeof row.provider_payment_id === "string" ? row.provider_payment_id : null,
    periodDays: Number(row.period_days ?? planPeriodDays),
    status: String(row.status ?? "pending"),
    plan: row.plan,
    amountRub: Number(row.amount ?? 0),
    // Колонки может не быть (миграция длинных периодов не прогнана) — тогда
    // все платежи прежние, то есть оплата периода.
    kind: row.kind === "seat" ? "seat" : "subscription",
    isRecurring: row.is_recurring === true,
    autopayRequested: (row.metadata as { autopay?: unknown } | null)?.autopay === true,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

export type ActivationOutcome =
  | { kind: "already_canceled" }
  | { kind: "canceled" }
  | { kind: "waiting"; status: YooKassaStatus }
  | { kind: "already_succeeded" }
  | { kind: "succeeded"; until: string | null }
  | { kind: "amount_mismatch" }
  | { kind: "failed" };

// Применяет исход платежа: закрывает строку, двигает subscription_until,
// разбирается с привязкой карты и реферальным бонусом. Идемпотентна —
// повторный вызов по уже закрытой строке вернёт already_*.
export async function applySubscriptionPaymentResult(input: {
  supabase: SupabaseClient;
  row: SubscriptionPaymentRow;
  payment: YooKassaPayment;
}): Promise<ActivationOutcome> {
  const { supabase, row, payment } = input;

  if (payment.status === "canceled") {
    // Отмену по этой строке уже обработали (обычно — сама job продления, она
    // видит статус в ответе на списание). Повторно считать неудачу нельзя:
    // мастер потеряет попытку из-за дубля уведомления.
    if (row.status === "canceled") {
      return { kind: "already_canceled" };
    }

    // Причину отказа сохраняем: по ней настройки объясняют мастеру, почему
    // оплата не прошла. Без неё остаётся только «что-то пошло не так», а
    // «на карте не хватило средств» и «карта просрочена» лечатся по-разному.
    await supabase
      .from("subscription_payments")
      .update({
        status: "canceled",
        metadata: {
          ...(row.metadata ?? {}),
          cancellationReason: payment.cancellationReason,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (row.isRecurring) {
      await registerFailedRenewal(supabase, {
        profileId: row.profileId,
        reason: payment.cancellationReason ?? "canceled",
      });
    }

    return { kind: "canceled" };
  }

  if (payment.status !== "succeeded") {
    // Платёж ещё не оплачен — ждём следующего уведомления.
    return { kind: "waiting", status: payment.status };
  }

  if (row.status === "succeeded") {
    return { kind: "already_succeeded" };
  }

  // Срок, тариф и число мест берутся из нашей строки, а деньги — из ЮKassa.
  // Сверяем одно с другим: строку платежа пишет только сервер (миграция
  // 202611100001), но если она всё же разойдётся с оплаченной суммой — из-за
  // ошибки в коде или вмешательства, — доступ за чужую цену выдавать нельзя.
  // Строку закрываем как отменённую, чтобы подборщик зависших платежей не
  // возвращался к ней каждый прогон; деньги при этом списаны, поэтому пишем
  // ошибку в ленту — такой платёж разбирается вручную.
  const paidRub = payment.amountValue === null ? null : Number(payment.amountValue);
  if (paidRub !== null && Number.isFinite(paidRub) && Math.abs(paidRub - row.amountRub) >= 0.01) {
    logError("Subscription payment amount does not match the payment row", {
      paymentRowId: row.id,
      profileId: row.profileId,
      providerPaymentId: payment.id,
      paidRub,
      expectedRub: row.amountRub,
    });

    await supabase
      .from("subscription_payments")
      .update({
        status: "canceled",
        metadata: {
          ...(row.metadata ?? {}),
          cancellationReason: "amount_mismatch",
          paidRub,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return { kind: "amount_mismatch" };
  }

  // Доплата за места: доступ уже оплачен, срок не двигаем. Меняется только
  // число оплаченных мест — и на этом всё, включая реферальный бонус и
  // привязку карты, которых у доплаты быть не должно.
  if (row.kind === "seat") {
    return applySeatTopUpResult({ supabase, row });
  }

  // Нужно узнать до обновления текущей записи: это первая успешная оплата
  // подписки у мастера? Реферальный бонус пригласившему начисляется только
  // за первую оплату приглашённого.
  const { count: priorSucceededCount } = await supabase
    .from("subscription_payments")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", row.profileId)
    .eq("status", "succeeded");
  const isFirstSuccessfulPayment = (priorSucceededCount ?? 0) === 0;

  // Тариф берём из оплаченной строки, а не хардкодим: мастер мог купить любой
  // из трёх. Неизвестное значение (старые платежи с plan='pro') трактуем как
  // «Соло. Расширенный» — столько доступа они и оплачивали.
  const paidPlanId: PlanId = isPlanId(row.plan) ? row.plan : "solo-plus";

  // Продлеваем от большей из дат: оплата в середине оплаченного периода не
  // должна сжигать остаток. Раньше здесь всегда стоял now(), из-за чего раннее
  // продление отнимало у мастера уже оплаченные дни. Реферальный бонус
  // (src/lib/referral-rewards.ts) считает так же.
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("subscription_until")
    .eq("id", row.profileId)
    .maybeSingle();

  const currentUntil = currentProfile?.subscription_until
    ? DateTime.fromISO(String(currentProfile.subscription_until))
    : null;
  const base =
    currentUntil?.isValid && currentUntil > DateTime.now()
      ? currentUntil
      : DateTime.now();
  const subscriptionUntil = base
    .plus(subscriptionPeriodDuration(row.profileId, row.periodDays))
    .toUTC()
    .toISO();

  await supabase
    .from("subscription_payments")
    .update({ status: "succeeded", updated_at: new Date().toISOString() })
    .eq("id", row.id);

  // Сколько мест оплачено этим платежом. Число считалось на момент оплаты и
  // лежит в строке платежа — пересчитывать его сейчас нельзя: команда могла
  // вырасти, пока мастер был на странице ЮKassa, и тогда мы записали бы
  // оплаченными места, за которые никто не платил.
  const paidSeats = Number(
    (row.metadata as { activeSeats?: unknown } | null)?.activeSeats ?? 0,
  );

  const legacyUpdate = {
    subscription_tier: paidPlanId,
    subscription_until: subscriptionUntil,
  };

  let { error: profileError } = await supabase
    .from("profiles")
    .update({
      ...legacyUpdate,
      // Длину нормализуем: в профиле она под ограничением на известные
      // периоды, а в строке платежа могло оказаться что угодно из истории.
      subscription_period_days: findBillingPeriodByDays(row.periodDays).days,
      subscription_paid_seats: Number.isFinite(paidSeats) ? Math.max(0, paidSeats) : 0,
    })
    .eq("id", row.profileId);

  // Миграция длинных периодов не прогнана. Оплата при этом прошла, деньги
  // списаны — оставить мастера без доступа нельзя, поэтому продлеваем тем,
  // что в базе есть. Длина периода и оплаченные места подождут миграции.
  if (profileError && isSupabaseMissingColumnError(profileError)) {
    logWarn("Prepaid-period columns are missing, activating with legacy fields", {
      profileId: row.profileId,
      paymentRowId: row.id,
    });
    profileError = (
      await supabase.from("profiles").update(legacyUpdate).eq("id", row.profileId)
    ).error;
  }

  if (profileError) {
    logError("Failed to activate subscription after payment", {
      paymentRowId: row.id,
      profileId: row.profileId,
      error: profileError,
    });
    return { kind: "failed" };
  }

  await writeAuditLog({
    actorKind: "system",
    profileId: row.profileId,
    eventType: "subscription.activated",
    targetType: "subscription_payment",
    targetId: row.id,
    metadata: { until: subscriptionUntil, recurring: row.isRecurring },
  });

  await syncAutopayAfterSuccess({
    supabase,
    row,
    paidPlanId,
    payment,
    subscriptionUntil,
  });

  // Чек НПД в «Мой налог». Ставится в очередь именно здесь, а не в вебхуке:
  // сюда же приходит подборщик зависших платежей и автосписание, и чек нужен
  // по каждому из этих путей. Функция не бросает и повторного чека не создаёт.
  await queueNalogReceipt({
    source: "subscription",
    sourceId: row.id,
    providerPaymentId: row.providerPaymentId ?? payment.id,
    profileId: row.profileId,
    amountRub: row.amountRub,
    description: `okno «${getPlan(paidPlanId).title}» — подписка на ${
      findBillingPeriodByDays(row.periodDays).days
    } дней`,
  });

  // Реферальная программа: за первую оплату PRO приглашённым мастером
  // пригласивший получает +30 дней PRO. Ошибки здесь не должны срывать
  // ответ вебхука и приводить к повторной отправке уведомления.
  if (isFirstSuccessfulPayment) {
    await applyReferralRewardForFirstPayment(supabase, {
      referredProfileId: row.profileId,
    });
  }

  return { kind: "succeeded", until: subscriptionUntil };
}

// Успешная доплата за места. Срок подписки не трогаем — она его не покупала.
// Записываем число мест, за которые заплачено: с ним сверяется кабинет, когда
// решает, можно ли добавить ещё одного сотрудника без доплаты.
//
// Число берём из строки платежа, а не из текущей команды: между оплатой и
// уведомлением мастер мог добавить ещё людей, и записать их оплаченными
// значило бы отдать места даром.
async function applySeatTopUpResult(input: {
  supabase: SupabaseClient;
  row: SubscriptionPaymentRow;
}): Promise<ActivationOutcome> {
  const { supabase, row } = input;

  const paidSeats = Number(
    (row.metadata as { activeSeats?: unknown } | null)?.activeSeats ?? 0,
  );

  await supabase
    .from("subscription_payments")
    .update({ status: "succeeded", updated_at: new Date().toISOString() })
    .eq("id", row.id);

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_paid_seats: Number.isFinite(paidSeats) ? Math.max(0, paidSeats) : 0,
    })
    .eq("id", row.profileId);

  if (error) {
    logError("Failed to apply seat top-up after payment", {
      paymentRowId: row.id,
      profileId: row.profileId,
      error,
    });
    return { kind: "failed" };
  }

  await writeAuditLog({
    actorKind: "system",
    profileId: row.profileId,
    eventType: "subscription.seats.paid",
    targetType: "subscription_payment",
    targetId: row.id,
    metadata: { paidSeats, amount: row.amountRub },
  });

  if (row.providerPaymentId) {
    await queueNalogReceipt({
      source: "seat",
      sourceId: row.id,
      providerPaymentId: row.providerPaymentId,
      profileId: row.profileId,
      amountRub: row.amountRub,
      description: `okno — оплата мест в команде (${paidSeats})`,
    });
  }

  return { kind: "succeeded", until: null };
}

// Состояние автопродления после успешной оплаты.
//
// Ручная оплата с галочкой «продлевать автоматически»: ЮKassa вернула
// payment_method.saved=true — сохраняем привязку и включаем автопродление.
// Автосписание: привязка уже есть, а согласие мастер мог отозвать, пока
// платёж был в пути, поэтому autopay_enabled тут не трогаем вообще —
// иначе отвязка карты откатилась бы сама собой. Сбрасываем только счётчик
// неудачных попыток.
async function syncAutopayAfterSuccess(input: {
  supabase: SupabaseClient;
  row: SubscriptionPaymentRow;
  paidPlanId: PlanId;
  payment: YooKassaPayment;
  subscriptionUntil: string | null;
}) {
  const { supabase, row, paidPlanId, payment, subscriptionUntil } = input;

  if (row.isRecurring) {
    // Отметку о предупреждении снимаем — следующий период получит своё.
    await supabase
      .from("profiles")
      .update({
        autopay_failed_attempts: 0,
        autopay_next_attempt_at: null,
        autopay_reminder_sent_at: null,
      })
      .eq("id", row.profileId);

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", row.profileId)
      .maybeSingle();

    await notifySubscriptionAutopayCharged({
      chatId: profileRow?.telegram_chat_id ? String(profileRow.telegram_chat_id) : null,
      amountRub: row.amountRub,
      untilLabel: formatSubscriptionUntil(subscriptionUntil),
    });
    return;
  }

  // Ручная оплата закрывает обрыв автопродления: мастер разобрался и заплатил,
  // держать счётчик неудачных списаний больше не за чем. Без этого сообщение
  // «автопродление отключилось из-за неудачных списаний» висело бы в кабинете
  // вечно — сбросить его иначе может только новая привязка карты.
  await supabase
    .from("profiles")
    .update({ autopay_failed_attempts: 0, autopay_next_attempt_at: null })
    .eq("id", row.profileId);

  // Карта не привязалась: мастер не ставил галочку либо заплатил способом,
  // который привязать нельзя (кошелёк, SBP). Подписка при этом оплачена —
  // молча включать автопродление не с чего.
  if (!payment.paymentMethod?.saved) {
    // Если галочка была, а карты нет — это либо неподходящий способ оплаты,
    // либо у магазина не включены автоплатежи. Мастеру об этом скажут
    // настройки, а нам нужен след в логах: без него причина не ищется.
    if (row.autopayRequested) {
      logWarn("Autopay requested but YooKassa did not save the payment method", {
        profileId: row.profileId,
        paymentId: payment.id,
        methodType: payment.paymentMethod?.type ?? null,
      });
    }
    return;
  }

  const method = await saveSubscriptionPaymentMethod(supabase, {
    profileId: row.profileId,
    method: payment.paymentMethod,
  });

  if (!method) {
    return;
  }

  await supabase
    .from("subscription_payments")
    .update({ payment_method_id: method.id })
    .eq("id", row.id);

  const { error } = await supabase
    .from("profiles")
    .update({
      autopay_enabled: true,
      autopay_plan: paidPlanId,
      // Продлевать будем тем же периодом, который мастер только что купил:
      // оплатил год — спишется год по цене со скидкой. Иначе автопродление
      // молча переводило бы его на месяц по полной цене.
      autopay_period_days: findBillingPeriodByDays(row.periodDays).days,
      autopay_failed_attempts: 0,
      autopay_next_attempt_at: null,
      autopay_reminder_sent_at: null,
      // Привязка снова живая — отметка о её окончании больше не про неё.
      autopay_detached_at: null,
    })
    .eq("id", row.profileId);

  if (error) {
    logError("Failed to enable autopay after successful payment", {
      profileId: row.profileId,
      error,
    });
    return;
  }

  await writeAuditLog({
    actorKind: "system",
    profileId: row.profileId,
    eventType: "subscription.autopay.enabled",
    targetType: "subscription_payment_method",
    targetId: method.id,
    metadata: { plan: paidPlanId, cardLast4: method.cardLast4 },
  });
}

// ---- Подборщик зависших платежей ----

// Сколько платёж должен провисеть в pending, чтобы считать уведомление
// потерянным. ЮKassa обычно присылает его за секунды; десять минут — заведомо
// больше любой нормальной задержки и меньше, чем мастер согласен ждать.
const PENDING_SWEEP_AFTER_MINUTES = 10;

// Старые pending — это брошенные оплаты: мастер открыл страницу ЮKassa и
// закрыл её. ЮKassa со временем отменит их сама, и подборщик закроет строку
// по факту. Спрашивать про них вечно незачем.
const PENDING_SWEEP_MAX_AGE_DAYS = 30;

const PENDING_SWEEP_BATCH = 25;

export type PendingSweepResult = {
  checked: number;
  activated: number;
  canceled: number;
};

// Платежи, по которым ЮKassa не прислала уведомление (или прислала, а мы его
// не приняли). Перезапрашиваем статус сами и доводим до конца тем же кодом,
// что и вебхук. Касается и автосписаний, и ручных оплат: мастер, заплативший
// руками и не получивший доступ, страдает ровно так же.
export async function sweepStuckPendingPayments(): Promise<PendingSweepResult> {
  const admin = createSupabaseAdminClient();
  const now = DateTime.now();
  const staleBefore = now.minus({ minutes: PENDING_SWEEP_AFTER_MINUTES }).toUTC().toISO()!;
  const tooOldBefore = now.minus({ days: PENDING_SWEEP_MAX_AGE_DAYS }).toUTC().toISO()!;

  const { data, error } = await admin
    .from("subscription_payments")
    .select(SUBSCRIPTION_PAYMENT_COLUMNS)
    .eq("status", "pending")
    .not("provider_payment_id", "is", null)
    .lt("created_at", staleBefore)
    .gt("created_at", tooOldBefore)
    .order("created_at")
    .limit(PENDING_SWEEP_BATCH);

  if (error) {
    logError("Failed to select stuck pending subscription payments", { error });
    return { checked: 0, activated: 0, canceled: 0 };
  }

  const result: PendingSweepResult = { checked: 0, activated: 0, canceled: 0 };

  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const row = mapSubscriptionPaymentRow(raw);

    if (!row.providerPaymentId) {
      continue;
    }

    result.checked += 1;

    try {
      const payment = await getYooKassaPayment(row.providerPaymentId);
      const outcome = await applySubscriptionPaymentResult({
        supabase: admin,
        row,
        payment,
      });

      if (outcome.kind === "succeeded") {
        result.activated += 1;
        logWarn("Recovered a subscription payment whose webhook never arrived", {
          paymentRowId: row.id,
          profileId: row.profileId,
          recurring: row.isRecurring,
        });
      }

      if (outcome.kind === "canceled") {
        result.canceled += 1;
      }
    } catch (error) {
      // Один недоступный платёж не должен ронять весь прогон: остальные
      // зависшие строки всё ещё ждут разбора.
      logError("Failed to re-check stuck pending payment", {
        paymentRowId: row.id,
        error,
      });
    }
  }

  return result;
}
