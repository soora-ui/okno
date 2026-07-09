import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { isYooKassaConfigured } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";
import { writeAuditLog } from "@/lib/observability/audit";
import { getYooKassaPayment } from "@/lib/payments/yookassa";
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
  } catch (error) {
    logError("Webhook: unexpected error", { paymentId, error });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }
}

// Подтверждение предоплаты по услуге (Модуль 2, okno-tz-rating-prepayment.md,
// ТЗ 2.5). Идемпотентность: если prepayments.status уже 'paid', выходим сразу
// — ЮKassa может слать вебхук повторно.
async function handlePrepaymentWebhook(paymentId: string) {
  try {
    const payment = await getYooKassaPayment(paymentId);

    const supabase = createSupabaseAdminClient();
    const { data: prepaymentRow, error: rowError } = await supabase
      .from("prepayments")
      .select("id, booking_id, profile_id, status")
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
