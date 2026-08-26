import { NextResponse } from "next/server";
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
import {
  SUBSCRIPTION_PAYMENT_COLUMNS,
  applySubscriptionPaymentResult,
  mapSubscriptionPaymentRow,
} from "@/lib/subscription-activation";
import { notifyMasterYooKassaRevoked } from "@/lib/notifications";
import { getClientIp } from "@/lib/public-booking-guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Вебхук ЮKassa. Тело уведомления не является доверенным источником: статус
// оплаты мы перепроверяем прямым запросом к API ЮKassa, поэтому подделать
// активацию PRO/сертификата нельзя. Каким ключом перепроверять — зависит от
// того, в чьём магазине создан платёж: подписка PRO и чаевые живут в магазине
// платформы (её пара shopId/secretKey), предоплата и сертификаты — в магазине
// мастера, и перепроверяются его OAuth-токеном. Дополнительно принимаем
// уведомления только с IP-адресов ЮKassa (HMAC-подписи у их вебхуков нет —
// IP-фильтр это официальная рекомендация). Всегда отвечаем 2xx на
// обработанные события, чтобы ЮKassa не слала повторы; 5xx — только при
// внутренней ошибке (даём повтор).
//
// Один платёж всегда относится ровно к одной своей таблице
// (subscription_payments — платит мастер за PRO, gift_certificates — платит
// клиент за сертификат, prepayments — предоплата за услугу, tips — чаевые);
// metadata.kind в самом платеже ЮKassa указывает, какую ветку проверять
// первой, но мы все равно смотрим на реальное совпадение
// provider_payment_id, а не доверяем присланным метаданным вслепую.
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

  // Все платежи сервиса приходят в один вебхук, но лежат в разных таблицах.
  // metadata.kind — быстрая маршрутизация; если её нет (старые платежи PRO
  // без поля kind), проверяем subscription_payments по умолчанию, как и
  // раньше. Предоплата и сертификаты выделены в свои ветки не ради скорости:
  // их платежи созданы токеном мастера, и запрашивать их платформенными
  // ключами бессмысленно — ЮKassa ответит 404.
  if (notificationKind === "prepayment") {
    return handlePrepaymentWebhook(paymentId);
  }

  if (notificationKind === "gift_certificate") {
    return handleGiftCertificateWebhook(paymentId);
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
    .select(SUBSCRIPTION_PAYMENT_COLUMNS)
    .eq("provider_payment_id", paymentId)
    .maybeSingle();

  if (rowError) {
    logError("Webhook: failed to load payment row", { paymentId, error: rowError });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }

  if (!paymentRow) {
    return NextResponse.json({ ok: true, ignored: "unknown_payment" });
  }

  // Вся работа — в общей функции: тем же кодом пользуется подборщик зависших
  // платежей (src/lib/subscription-activation.ts). Здесь остаётся только
  // перевод исхода в ответ, который ждёт ЮKassa.
  const outcome = await applySubscriptionPaymentResult({
    supabase,
    row: mapSubscriptionPaymentRow(paymentRow as Record<string, unknown>),
    payment,
  });

  switch (outcome.kind) {
    case "already_canceled":
      return NextResponse.json({ ok: true, status: "already_canceled" });
    case "canceled":
      return NextResponse.json({ ok: true, status: "canceled" });
    case "waiting":
      return NextResponse.json({ ok: true, status: outcome.status });
    case "already_succeeded":
      return NextResponse.json({ ok: true, status: "already_succeeded" });
    case "succeeded":
      return NextResponse.json({ ok: true, status: "succeeded" });
    case "failed":
      return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }
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

  // Чек НПД здесь не выбивается: чаевые — деньги клиента в адрес мастера, а
  // не доход платформы (PRODUCT.md, «Деньги»). Чек по ним — обязанность
  // мастера, и после переезда чаевых на CloudTips платформа их вообще не
  // увидит (okno-todo.md).

  return NextResponse.json({ ok: true, status: "succeeded" });
}

const GIFT_CERTIFICATE_COLUMNS =
  "id, profile_id, status, code, amount, master_yookassa_account_id";

type GiftCertificateRow = {
  id: string;
  profile_id: string;
  status: string;
  amount: number;
  master_yookassa_account_id: string | null;
};

// Сертификат покупает клиент у мастера, и платёж создан в магазине мастера его
// OAuth-токеном (см. purchaseGiftCertificateAction) — статус перепроверяем тем
// же Bearer-токеном, платформенная пара shopId/secretKey к этим деньгам
// отношения не имеет (PRODUCT.md, «Деньги»). Сертификаты, купленные до
// перехода на OAuth, лежат без master_yookassa_account_id: их платёж остался в
// магазине платформы, и перепроверять его можно только её ключами.
async function handleGiftCertificateWebhook(paymentId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: certificateRow, error: rowError } = await supabase
      .from("gift_certificates")
      .select(GIFT_CERTIFICATE_COLUMNS)
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
      // Платёж помечен как сертификатный, но сертификата под него нет — не
      // молчим 404-кой, пробуем остальные ветки, как и раньше.
      return handleSubscriptionWebhook(paymentId);
    }

    const row = certificateRow as unknown as GiftCertificateRow;
    let payment: YooKassaPayment;

    if (row.master_yookassa_account_id) {
      const { data: accountRow, error: accountError } = await supabase
        .from("master_yookassa_accounts")
        .select("access_token_encrypted")
        .eq("id", row.master_yookassa_account_id)
        .maybeSingle();

      if (accountError || !accountRow) {
        logError("Webhook: failed to load master YooKassa account for gift certificate", {
          paymentId,
          certificateId: row.id,
          error: accountError,
        });
        return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
      }

      try {
        const accessToken = decryptOAuthToken(String(accountRow.access_token_encrypted));
        payment = await getYooKassaPaymentWithToken(accessToken, paymentId);
      } catch (error) {
        if (error instanceof YooKassaAuthError) {
          // Мастер отозвал доступ напрямую в ЮKassa — синхронизируем статус и
          // просим переподключиться. Сертификат остаётся pending: подтвердить
          // оплату нечем, а выдавать его без подтверждения нельзя.
          await markMasterYooKassaAccountRevoked(supabase, String(row.profile_id));

          const { data: profileRow } = await supabase
            .from("profiles")
            .select("telegram_chat_id")
            .eq("id", row.profile_id)
            .maybeSingle();
          await notifyMasterYooKassaRevoked({
            chatId: profileRow?.telegram_chat_id ? String(profileRow.telegram_chat_id) : null,
          });

          return NextResponse.json({ ok: true, status: "master_token_revoked" });
        }

        throw error;
      }
    } else {
      payment = await getYooKassaPayment(paymentId);
    }

    return applyGiftCertificatePayment({ supabase, certificateRow: row, payment });
  } catch (error) {
    logError("Webhook: unexpected error (gift certificate)", { paymentId, error });
    return NextResponse.json({ error: "Внутренняя ошибка." }, { status: 500 });
  }
}

// Ветка для платежей, у которых kind виден только в самом платеже, но не в теле
// уведомления. Такое возможно лишь у сертификатов, купленных до перехода на
// OAuth (платёж уже получен ключами платформы вызывающим кодом) — у новых
// платёж платформенными ключами не читается вовсе.
async function handleGiftCertificatePayment(input: {
  supabase: SupabaseAdminClient;
  paymentId: string;
  payment: YooKassaPayment;
}): Promise<Response | null> {
  const { supabase, paymentId, payment } = input;

  const { data: certificateRow, error: rowError } = await supabase
    .from("gift_certificates")
    .select(GIFT_CERTIFICATE_COLUMNS)
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

  return applyGiftCertificatePayment({
    supabase,
    certificateRow: certificateRow as unknown as GiftCertificateRow,
    payment,
  });
}

async function applyGiftCertificatePayment(input: {
  supabase: SupabaseAdminClient;
  certificateRow: GiftCertificateRow;
  payment: YooKassaPayment;
}) {
  const { supabase, certificateRow, payment } = input;

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

  // Чек НПД не выбивается: сертификат покупает клиент у мастера, деньги —
  // его, а не платформы (PRODUCT.md, «Деньги»).

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
