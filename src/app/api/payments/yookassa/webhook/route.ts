import { after, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { isYooKassaConfigured } from "@/lib/env";
import { certificateValidityDays } from "@/lib/gift-certificates";
import { logError, logWarn } from "@/lib/observability/logger";
import { writeAuditLog } from "@/lib/observability/audit";
import { processNotificationQueue } from "@/lib/notification-queue";
import { getYooKassaPayment, type YooKassaPayment } from "@/lib/payments/yookassa";
import { isYooKassaIp } from "@/lib/payments/yookassa-ips";
import { getClientIp } from "@/lib/public-booking-guards";
import { applyReferralRewardForFirstPayment } from "@/lib/referral-rewards";
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
  try {
    const body = (await request.json()) as {
      object?: { id?: unknown };
    };
    paymentId =
      body.object && typeof body.object.id === "string" ? body.object.id : null;
  } catch {
    return NextResponse.json({ error: "Некорректное тело." }, { status: 400 });
  }

  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: "no_payment_id" });
  }

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
    .select("id, profile_id, period_days, status")
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

  const periodDays = Number(paymentRow.period_days ?? 30);
  const subscriptionUntil = DateTime.now()
    .plus({ days: periodDays })
    .toUTC()
    .toISO();

  await supabase
    .from("subscription_payments")
    .update({ status: "succeeded", updated_at: new Date().toISOString() })
    .eq("id", paymentRow.id);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      subscription_tier: "pro",
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
    .select("id, profile_id, status, code, amount, purchaser_contact, expires_at")
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

  const expiresAt =
    certificateRow.expires_at ??
    DateTime.now().plus({ days: certificateValidityDays }).toUTC().toISO();

  await supabase
    .from("gift_certificates")
    .update({
      status: "active",
      expires_at: expiresAt,
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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", certificateRow.profile_id)
    .maybeSingle();
  const masterName = String(profileRow?.full_name ?? "мастер");
  const expiresAtLabel = DateTime.fromISO(expiresAt ?? "", { zone: "utc" })
    .setLocale("ru")
    .toFormat("d LLLL yyyy");

  const purchaserContact = String(certificateRow.purchaser_contact ?? "");
  const looksLikePhone = /^\+?\d[\d\s-]{7,}$/.test(purchaserContact);

  if (looksLikePhone) {
    const { data: notificationRow, error: notificationError } = await supabase
      .from("notification_events")
      .insert({
        profile_id: certificateRow.profile_id,
        type: "sms_certificate_code",
        status: "queued",
        target: purchaserContact,
        payload: {
          phone: purchaserContact,
          masterName,
          amount: certificateRow.amount,
          code: certificateRow.code,
          expiresAtLabel,
        },
      })
      .select("id")
      .single();

    if (notificationError) {
      logError("Webhook: failed to enqueue certificate code delivery", {
        certificateId: certificateRow.id,
        error: notificationError,
      });
    } else if (notificationRow) {
      after(async () => {
        await processNotificationQueue([String(notificationRow.id)]);
      });
    }
  } else {
    logWarn("Webhook: purchaser contact is not a phone number, skipping SMS delivery", {
      certificateId: certificateRow.id,
    });
  }

  return NextResponse.json({ ok: true, status: "succeeded" });
}
