"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { env, isSupabaseConfigured } from "@/lib/env";
import { normalizeBookingPageSettings } from "@/lib/booking-page-settings";
import {
  generateCertificateToken,
  hashCertificateToken,
} from "@/lib/certificate-verification";
import {
  generateGiftCertificateCode,
  giftCertificatePurchaseSchema,
} from "@/lib/gift-certificates";
import { logError } from "@/lib/observability/logger";
import { writeAuditLog } from "@/lib/observability/audit";
import { notifyMasterYooKassaRevoked } from "@/lib/notifications";
import { createYooKassaPaymentWithToken, YooKassaAuthError } from "@/lib/payments/yookassa";
import {
  getActiveMasterYooKassaToken,
  markMasterYooKassaAccountRevoked,
} from "@/lib/payments/yookassa-oauth";
import {
  isSupabaseMissingColumnError,
  isSupabaseMissingTableError,
} from "@/lib/supabase/auth-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type GiftCertificatePurchaseActionState = {
  success: boolean;
  message: string;
};

const migrationHint =
  "В базе еще нет таблицы сертификатов. Прогони миграцию 202607090001_gift_certificates.sql и попробуй еще раз.";

const oauthMigrationHint =
  "В базе еще нет связи сертификата с магазином мастера. Прогони миграцию 202608070001_gift_certificates_master_yookassa.sql и попробуй еще раз.";

// Покупка подарочного сертификата с публичной страницы мастера. Платит
// покупатель (клиент), не мастер — в отличие от PRO-подписки. Создаем
// pending-запись у себя и в ЮKassa, затем уводим покупателя на оплату.
// Код сертификата отправится покупателю уже вебхуком после успешной оплаты.
//
// Деньги идут напрямую в магазин мастера через его OAuth-токен ЮKassa, минуя
// счёт платформы — платформа не платёжный агент (PRODUCT.md, «Деньги»;
// okno-functional-description.md п. 7.2). Тот же механизм, что у предоплаты
// за услугу (src/app/api/bookings/route.ts), платформенная пара
// shopId/secretKey здесь не участвует.
export async function purchaseGiftCertificateAction(
  _prevState: GiftCertificatePurchaseActionState,
  formData: FormData,
): Promise<GiftCertificatePurchaseActionState> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Покупка сертификата пока недоступна: нет подключения к Supabase.",
    };
  }

  const parsed = giftCertificatePurchaseSchema.safeParse({
    username: formData.get("username") ?? "",
    amount: formData.get("amount") ?? "",
    serviceId: formData.get("serviceId") ?? "",
    purchaserEmail: formData.get("purchaserEmail") ?? "",
    purchaserContact: formData.get("purchaserContact") ?? "",
  });

  if (!parsed.success) {
    // Показываем конкретную причину: чаще всего это опечатка в почте, а
    // общее «проверь данные» заставляет гадать, что именно не так.
    const first = parsed.error.issues[0];
    return {
      success: false,
      message: first?.message ?? "Проверь сумму сертификата и почту.",
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, booking_page_settings, account_status, telegram_chat_id")
    .eq("username", parsed.data.username)
    .maybeSingle();

  if (profileError) {
    logError("Failed to load profile for gift certificate purchase", {
      username: parsed.data.username,
      error: profileError,
    });
    return { success: false, message: "Мастер не найден." };
  }

  if (!profileRow || String(profileRow.account_status ?? "active") === "disabled") {
    return { success: false, message: "Мастер не найден." };
  }

  const settings = normalizeBookingPageSettings(profileRow.booking_page_settings);
  if (!settings.giftCertificatesEnabled) {
    return { success: false, message: "Мастер сейчас не продает сертификаты." };
  }

  if (!settings.giftCertificateDenominations.includes(parsed.data.amount)) {
    return { success: false, message: "Выбери один из предложенных номиналов." };
  }

  if (parsed.data.serviceId) {
    const { data: serviceRow, error: serviceError } = await admin
      .from("services")
      .select("id")
      .eq("id", parsed.data.serviceId)
      .eq("profile_id", profileRow.id)
      .maybeSingle();

    if (serviceError || !serviceRow) {
      return { success: false, message: "Выбранная услуга не найдена." };
    }
  }

  // Оплату принимает магазин мастера, а не платформы, — без активного
  // OAuth-подключения продавать сертификат нечем. Проверяем до создания
  // pending-строки, чтобы не плодить мусорные сертификаты, которые всё равно
  // некому оплатить (мастер не может включить продажу, не подключив ЮKassa,
  // см. updateCertificateSalesEnabledAction; эта проверка ловит случай, когда
  // он отключил её уже после включения продажи).
  const masterYooKassaToken = await getActiveMasterYooKassaToken(admin, profileRow.id);

  if (!masterYooKassaToken) {
    return {
      success: false,
      message:
        "Мастер сейчас не может принять оплату сертификата. Свяжись с мастером напрямую.",
    };
  }

  const { data: templateRow } = await admin
    .from("certificate_templates")
    .select("id")
    .eq("profile_id", profileRow.id)
    .maybeSingle();

  const code = generateGiftCertificateCode();
  const idempotenceKey = randomUUID();
  const token = generateCertificateToken();
  const tokenHash = hashCertificateToken(token);
  // Срок действия — снэпшот текущих настроек мастера на момент покупки
  // (ТЗ: "уже выпущенные сертификаты сохраняют условия, действовавшие на
  // момент выпуска"), не общая константа.
  const expiresAt = settings.giftCertificateNoExpiry ? null : settings.giftCertificateExpiryDate;

  const { data: certificateRow, error: insertError } = await admin
    .from("gift_certificates")
    .insert({
      profile_id: profileRow.id,
      code,
      amount: parsed.data.amount,
      remaining_amount: parsed.data.amount,
      service_id: parsed.data.serviceId || null,
      template_id: templateRow?.id ?? null,
      token_hash: tokenHash,
      status: "pending",
      purchaser_contact: [parsed.data.purchaserEmail, parsed.data.purchaserContact]
        .filter(Boolean)
        .join(" · "),
      provider: "yookassa",
      master_yookassa_account_id: masterYooKassaToken.accountId,
      idempotence_key: idempotenceKey,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !certificateRow) {
    if (isSupabaseMissingTableError(insertError, "gift_certificates")) {
      return { success: false, message: migrationHint };
    }

    if (isSupabaseMissingColumnError(insertError, "master_yookassa_account_id")) {
      return { success: false, message: oauthMigrationHint };
    }

    logError("Failed to create gift certificate row", {
      profileId: profileRow.id,
      error: insertError,
    });
    return { success: false, message: "Не получилось начать покупку сертификата." };
  }

  let confirmationUrl: string | null = null;

  try {
    const payment = await createYooKassaPaymentWithToken(masterYooKassaToken.accessToken, {
      amountRub: parsed.data.amount,
      // Без префикса «okno»: платёж проходит в магазине мастера, и покупатель
      // видит это описание в выписке рядом с именем мастера, а не сервиса.
      description: `Подарочный сертификат на ${parsed.data.amount} руб. — ${profileRow.full_name}`,
      // certificateId + ct(token) в возвратном URL — единственный способ
      // покупателя (без аккаунта) доказать право на скачивание PDF после
      // оплаты; тот же токен зашит в QR-код на самом сертификате.
      returnUrl: `${env.appUrl}/${parsed.data.username}?certificate=${certificateRow.id}&ct=${token}`,
      idempotenceKey,
      metadata: {
        kind: "gift_certificate",
        profileId: profileRow.id,
        certificateId: certificateRow.id,
      },
    });

    confirmationUrl = payment.confirmationUrl;

    await admin
      .from("gift_certificates")
      .update({
        provider_payment_id: payment.id,
        status: payment.status === "succeeded" ? "paid" : "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", certificateRow.id);
  } catch (error) {
    logError("Failed to create YooKassa payment for gift certificate", {
      profileId: profileRow.id,
      error,
    });
    await admin
      .from("gift_certificates")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", certificateRow.id);

    if (error instanceof YooKassaAuthError) {
      // Мастер отозвал доступ на стороне ЮKassa напрямую, не через кнопку
      // «Отключить» — синхронизируем статус и просим переподключиться, иначе
      // следующие покупатели тоже упрутся в ту же стену.
      await markMasterYooKassaAccountRevoked(admin, profileRow.id);
      await notifyMasterYooKassaRevoked({
        chatId: profileRow.telegram_chat_id ? String(profileRow.telegram_chat_id) : null,
      });
      return {
        success: false,
        message:
          "Мастер сейчас не может принять оплату сертификата. Свяжись с мастером напрямую.",
      };
    }

    return {
      success: false,
      message: "ЮKassa не приняла платеж. Попробуй еще раз.",
    };
  }

  await writeAuditLog({
    actorKind: "client",
    profileId: String(profileRow.id),
    eventType: "gift_certificate.purchase.started",
    targetType: "gift_certificate",
    targetId: String(certificateRow.id),
    metadata: { amount: parsed.data.amount },
  });

  if (!confirmationUrl) {
    return {
      success: false,
      message: "ЮKassa не вернула ссылку на оплату. Попробуй еще раз.",
    };
  }

  redirect(confirmationUrl);
}
