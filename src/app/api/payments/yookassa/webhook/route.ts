import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { isYooKassaConfigured } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";
import { writeAuditLog } from "@/lib/observability/audit";
import {
  getYooKassaPayment,
  getYooKassaPaymentWithToken,
  YooKassaAuthError,
  type YooKassaPayment,
} from "@/lib/payments/yookassa";
import { isYooKassaIp } from "@/lib/payments/yookassa-ips";
import { decryptOAuthToken, markMasterYooKassaAccountRevoked } from "@/lib/payments/yookassa-oauth";
import { notifyMasterYooKassaRevoked } from "@/lib/notifications";
import { getClientIp } from "@/lib/public-booking-guards";
import { applyReferralRewardForFirstPayment } from "@/lib/referral-rewards";
import { type PlanId, isPlanId } from "@/config/plans";
import { planPeriodDays } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Вебхук ЮKassa. Тело уведомления не является доверенным источником: статус
// оплаты мы перепроверяем прямым запросом к API ЮKassa нашими ключами, поэтому
// подделать активацию PRO/сертификата нельзя. Дополнительно принимаем
// уведомления только с IP-адресов ЮKassa (HMAC-подписи у их вебхуков нет —
// IP-фильтр это официальная рекомендация). Всегда отвечаем 2xx на
// обработанные события, чтобы ЮKassa не слала повторы; 5xx — только при
// внутренней ошибке (даём повтор).
//
// Один платёж всегда относится ровно к одной из двух своих таблиц
// (subscription_payments — платит мастер за PRO, gift_certificates — платит
// клиент за сертификат); metadata.kind в самом платеже ЮKassa указывает,
// какую ветку проверять первой, но мы все равно смотрим на реальное
// совпадение provider_payment_id, а не доверяем присланным метаданным вслепую.
export async function POST(request: Request) {
  if (!isYooKassaConfigured) {
    return NextResponse.json({ error: "ЮKassa не настроена." }, { status: 503 });
  }

  const clientIp = getClientIp(request);
  if (!isYooKassaIp(clientIp)) {
    logWarn("Webhook: rejected notification from non-YooKassa IP", {
      ip: clientIp,
    });
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  let paymentId: string | null = null;
  let notificationKind: unknown = null;
  try {
    const body = (await request.json()) as {
      object?: { id?: unknown; metadata?: { kind?: unknown } };
    };
    paymentId =
      body.object && typeof body.object.id === "string" ? body.object.id : null;
    notificationKind = body.object?.metadata?.kind ?? null;
  } catch {
    return NextResponse.json({ error: "Некорректное тело." }, { status: 400 });
  }

  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: "no_payment_id" });
  }

  // Предоплата за услугу (Модуль 2, okno-tz-rating-prepayment.md) и
  // подписка PRO мастера используют один и тот же вебхук ЮKassa, но
  // разные таблицы. metadata.kind — быстрая маршрутизация; если её нет
  // (старые платежи PRO без поля kind), проверяем subscription_payments
  // по умолчанию, как и раньше.
  if (notificationKind === "prepayment") {
    return handlePrepaymentWebhook(paymentId);
  }

  return handleSubscriptionWebhook(paymentId);
}

async function handleSubscriptionWebhook(paymentId: string) {
  try {
    // Источник истины — сам ЮKassa, а не присланное уведомление.
    const payment = await getYooKassaPayment(paymentId);
    const supabase = createSupabaseAdminClient();

    if (payment.metadata?.kind === "tip") {
      return await handleTipPayment({ supabase, paymentId, payment });
    }

    if (payment.metadata?.kind === "gift_certificate") {
      const certificateResult = await handleGiftCertificatePayment({
        supabase,
        paymentId,
        payment,
      });
      if (certificateResult) {
        return certificateResult;
      }
      // Не нашли сертификат по этому платежу — на всякий случай пробуем
      // ветку подписки ниже (не должно происходить, но не молчим 404-кой).
    }

    return await handleSubscriptionPayment({ supabase, paymentId, payment });
  } catch (error) {
    logError("Webhook: unexpected error", { paymentId, error });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }
}

async function handleSubscriptionPayment(input: {
  supabase: SupabaseAdminClient;
  paymentId: string;
  payment: YooKassaPayment;
}) {
  const { supabase, paymentId, payment } = input;

  const { data: paymentRow, error: rowError } = await supabase
    .from("subscription_payments")
    .select("id, profile_id, period_days, status, plan")
    .eq("provider_payment_id", paymentId)
    .maybeSingle();

  if (rowError) {
    logError("Webhook: failed to load payment row", { paymentId, error: rowError });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }

  if (!paymentRow) {
    return NextResponse.json({ ok: true, ignored: "unknown_payment" });
  }

  if (payment.status === "canceled") {
    await supabase
      .from("subscription_payments")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", paymentRow.id);
    return NextResponse.json({ ok: true, status: "canceled" });
  }

  if (payment.status !== "succeeded") {
    // Платёж ещё не оплачен — ждём следующего уведомления.
    return NextResponse.json({ ok: true, status: payment.status });
  }

  if (paymentRow.status === "succeeded") {
    return NextResponse.json({ ok: true, status: "already_succeeded" });
  }

  // Нужно узнать до обновления текущей записи: это первая успешная оплата
  // подписки у мастера? Реферальный бонус пригласившему начисляется только
  // за первую оплату приглашённого.
  const { count: priorSucceededCount } = await supabase
    .from("subscription_payments")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", paymentRow.profile_id)
    .eq("status", "succeeded");
  const isFirstSuccessfulPayment = (priorSucceededCount ?? 0) === 0;

  const periodDays = Number(paymentRow.period_days ?? planPeriodDays);

  // Тариф берём из оплаченной строки, а не хардкодим: мастер мог купить любой
  // из трёх. Неизвестное значение (старые платежи с plan='pro') трактуем как
  // «Соло. Расширенный» — столько доступа они и оплачивали.
  const paidPlanId: PlanId = isPlanId(paymentRow.plan)
    ? paymentRow.plan
    : "solo-plus";

  // Продлеваем от большей из дат: оплата в середине оплаченного периода не
  // должна сжигать остаток. Раньше здесь всегда стоял now(), из-за чего раннее
  // продление отнимало у мастера уже оплаченные дни. Реферальный бонус
  // (src/lib/referral-rewards.ts) считает так же.
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("subscription_until")
    .eq("id", paymentRow.profile_id)
    .maybeSingle();

  const currentUntil = currentProfile?.subscription_until
    ? DateTime.fromISO(String(currentProfile.subscription_until))
    : null;
  const base =
    currentUntil?.isValid && currentUntil > DateTime.now()
      ? currentUntil
      : DateTime.now();
  const subscriptionUntil = base.plus({ days: periodDays }).toUTC().toISO();

  await supabase
    .from("subscription_payments")
    .update({ status: "succeeded", updated_at: new Date().toISOString() })
    .eq("id", paymentRow.id);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      subscription_tier: paidPlanId,
      subscription_until: subscriptionUntil,
    })
    .eq("id", paymentRow.profile_id);

  if (profileError) {
    logError("Webhook: failed to activate PRO", {
      paymentId,
      profileId: paymentRow.profile_id,
      error: profileError,
    });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }

  await writeAuditLog({
    actorKind: "system",
    profileId: paymentRow.profile_id,
    eventType: "subscription.activated",
    targetType: "subscription_payment",
    targetId: paymentRow.id,
    metadata: { until: subscriptionUntil },
  });

  // Реферальная программа: за первую оплату PRO приглашённым мастером
  // пригласивший получает +30 дней PRO. Не влияет на ответ вебхука ЮKassa —
  // ошибки здесь не должны приводить к повторной отправке уведомления.
  if (isFirstSuccessfulPayment) {
    await applyReferralRewardForFirstPayment(supabase, {
      referredProfileId: paymentRow.profile_id,
    });
  }

  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function handleTipPayment(input: {
  supabase: SupabaseAdminClient;
  paymentId: string;
  payment: YooKassaPayment;
}) {
  const { supabase, paymentId, payment } = input;

  const { data: tipRow, error: rowError } = await supabase
    .from("tips")
    .select("id, profile_id, booking_id, amount, status")
    .eq("provider_payment_id", paymentId)
    .maybeSingle();

  if (rowError) {
    logError("Webhook: failed to load tip row", { paymentId, error: rowError });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }

  if (!tipRow) {
    return NextResponse.json({ ok: true, ignored: "unknown_payment" });
  }

  if (payment.status === "canceled") {
    await supabase
      .from("tips")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", tipRow.id);
    return NextResponse.json({ ok: true, status: "canceled" });
  }

  if (payment.status !== "succeeded") {
    // Платёж ещё не оплачен — ждём следующего уведомления.
    return NextResponse.json({ ok: true, status: payment.status });
  }

  if (tipRow.status === "succeeded") {
    return NextResponse.json({ ok: true, status: "already_succeeded" });
  }

  const paidAt = new Date().toISOString();

  await supabase
    .from("tips")
    .update({ status: "succeeded", paid_at: paidAt, updated_at: paidAt })
    .eq("id", tipRow.id);

  await writeAuditLog({
    actorKind: "system",
    profileId: tipRow.profile_id,
    eventType: "tip.succeeded",
    targetType: "tip",
    targetId: tipRow.id,
    metadata: { amount: tipRow.amount, bookingId: tipRow.booking_id },
  });

  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function handleGiftCertificatePayment(input: {
  supabase: SupabaseAdminClient;
  paymentId: string;
  payment: YooKassaPayment;
}): Promise<Response | null> {
  const { supabase, paymentId, payment } = input;

  const { data: certificateRow, error: rowError } = await supabase
    .from("gift_certificates")
    .select("id, profile_id, status, code, amount")
    .eq("provider_payment_id", paymentId)
    .maybeSingle();

  if (rowError) {
    logError("Webhook: failed to load gift certificate row", {
      paymentId,
      error: rowError,
    });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }

  if (!certificateRow) {
    return null;
  }

  if (payment.status === "canceled") {
    await supabase
      .from("gift_certificates")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", certificateRow.id);
    return NextResponse.json({ ok: true, status: "canceled" });
  }

  if (payment.status !== "succeeded") {
    return NextResponse.json({ ok: true, status: payment.status });
  }

  if (certificateRow.status === "active" || certificateRow.status === "redeemed") {
    return NextResponse.json({ ok: true, status: "already_active" });
  }

  // expires_at уже вычислен и записан в момент покупки (снэпшот настроек
  // мастера на тот момент, см. purchaseGiftCertificateAction) — здесь
  // ничего не пересчитываем, null означает "без срока действия".
  await supabase
    .from("gift_certificates")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", certificateRow.id);

  await writeAuditLog({
    actorKind: "system",
    profileId: certificateRow.profile_id,
    eventType: "gift_certificate.activated",
    targetType: "gift_certificate",
    targetId: certificateRow.id,
    metadata: { amount: certificateRow.amount },
  });

  // Доставка сертификата покупателю — не SMS/email, а скачивание PDF по
  // возврату с оплаты (см. purchaseGiftCertificateAction: returnUrl несёт
  // certificateId+токен) и по /api/certificates/[id]/download. Рендер PDF
  // происходит лениво в самом download-роуте — вебхуку сырой токен
  // недоступен (в БД хранится только его хэш), поэтому отрендерить QR
  // здесь невозможно и не нужно.

  return NextResponse.json({ ok: true, status: "succeeded" });
}

// Подтверждение предоплаты по услуге (Модуль 2, okno-tz-rating-prepayment.md,
// ТЗ 2.5; okno-tz-yookassa-oauth.md). Идемпотентность: если
// prepayments.status уже 'paid', выходим сразу — ЮKassa может слать вебхук
// повторно.
//
// Платёж создан в магазине мастера, а не платформы — перепроверяем его тем
// же Bearer-токеном мастера (общий shopId платформы для предоплаты больше не
// используется), см. master_yookassa_account_id на строке prepayments.
async function handlePrepaymentWebhook(paymentId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: prepaymentRow, error: rowError } = await supabase
      .from("prepayments")
      .select("id, booking_id, profile_id, status, master_yookassa_account_id")
      .eq("provider_payment_id", paymentId)
      .maybeSingle();

    if (rowError) {
      logError("Webhook: failed to load prepayment row", { paymentId, error: rowError });
      return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
    }

    if (!prepaymentRow) {
      return NextResponse.json({ ok: true, ignored: "unknown_payment" });
    }

    if (prepaymentRow.status === "paid") {
      return NextResponse.json({ ok: true, status: "already_paid" });
    }

    if (!prepaymentRow.master_yookassa_account_id) {
      logError("Webhook: prepayment row has no linked master YooKassa account", {
        paymentId,
        prepaymentId: prepaymentRow.id,
      });
      return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
    }

    const { data: accountRow, error: accountError } = await supabase
      .from("master_yookassa_accounts")
      .select("access_token_encrypted")
      .eq("id", prepaymentRow.master_yookassa_account_id)
      .maybeSingle();

    if (accountError || !accountRow) {
      logError("Webhook: failed to load master YooKassa account for prepayment", {
        paymentId,
        error: accountError,
      });
      return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
    }

    let payment: YooKassaPayment;
    try {
      const accessToken = decryptOAuthToken(String(accountRow.access_token_encrypted));
      payment = await getYooKassaPaymentWithToken(accessToken, paymentId);
    } catch (error) {
      if (error instanceof YooKassaAuthError) {
        // Мастер отозвал доступ напрямую в ЮKassa — синхронизируем статус и
        // просим переподключиться, иначе следующие клиенты тоже не смогут
        // внести предоплату.
        await markMasterYooKassaAccountRevoked(supabase, String(prepaymentRow.profile_id));

        const { data: profileRow } = await supabase
          .from("profiles")
          .select("telegram_chat_id")
          .eq("id", prepaymentRow.profile_id)
          .maybeSingle();
        await notifyMasterYooKassaRevoked({
          chatId: profileRow?.telegram_chat_id ? String(profileRow.telegram_chat_id) : null,
        });

        return NextResponse.json({ ok: true, status: "master_token_revoked" });
      }

      throw error;
    }

    if (payment.status === "canceled") {
      await supabase
        .from("prepayments")
        .update({ status: "failed" })
        .eq("id", prepaymentRow.id);

      // Слот освобождается сразу — не ждём фоновую job протухания.
      await supabase
        .from("bookings")
        .update({ status: "cancelled_by_client", cancelled_at: new Date().toISOString() })
        .eq("id", prepaymentRow.booking_id)
        .eq("status", "pending_payment");

      return NextResponse.json({ ok: true, status: "canceled" });
    }

    if (payment.status !== "succeeded") {
      return NextResponse.json({ ok: true, status: payment.status });
    }

    const paidAt = new Date().toISOString();
    await supabase
      .from("prepayments")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", prepaymentRow.id);

    const { error: bookingError } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", prepaymentRow.booking_id)
      .eq("status", "pending_payment");

    if (bookingError) {
      logError("Webhook: failed to confirm prepaid booking", {
        paymentId,
        bookingId: prepaymentRow.booking_id,
        error: bookingError,
      });
      return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
    }

    await writeAuditLog({
      actorKind: "system",
      profileId: prepaymentRow.profile_id,
      eventType: "prepayment.paid",
      targetType: "prepayment",
      targetId: prepaymentRow.id,
      metadata: { bookingId: prepaymentRow.booking_id },
    });

    return NextResponse.json({ ok: true, status: "succeeded" });
  } catch (error) {
    logError("Webhook: unexpected error (prepayment)", { paymentId, error });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }
}
