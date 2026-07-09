import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isYooKassaConfigured } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";
import { writeAuditLog } from "@/lib/observability/audit";
import { getYooKassaPayment, type YooKassaPayment } from "@/lib/payments/yookassa";
import { isYooKassaIp } from "@/lib/payments/yookassa-ips";
import { getClientIp } from "@/lib/public-booking-guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Вебхук ЮKassa. Тело уведомления не является доверенным источником: статус
// оплаты мы перепроверяем прямым запросом к API ЮKassa нашими ключами, поэтому
// подделать активацию PRO нельзя. Дополнительно принимаем уведомления только
// с IP-адресов ЮKassa (HMAC-подписи у их вебхуков нет — IP-фильтр это
// официальная рекомендация). Всегда отвечаем 2xx на обработанные события,
// чтобы ЮKassa не слала повторы; 5xx — только при внутренней ошибке (даём повтор).
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

    if (payment.metadata.kind === "tip") {
      return await handleTipPayment(supabase, paymentId, payment);
    }

    return await handleSubscriptionPayment(supabase, paymentId, payment);
  } catch (error) {
    logError("Webhook: unexpected error", { paymentId, error });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }
}

async function handleSubscriptionPayment(
  supabase: SupabaseClient,
  paymentId: string,
  payment: YooKassaPayment,
) {
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

  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function handleTipPayment(
  supabase: SupabaseClient,
  paymentId: string,
  payment: YooKassaPayment,
) {
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
