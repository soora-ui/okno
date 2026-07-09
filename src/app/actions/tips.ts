"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured, isYooKassaConfigured, env } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createYooKassaPayment } from "@/lib/payments/yookassa";
import { isValidTipAmount } from "@/lib/tips";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TipActionState = {
  success: boolean;
  message: string;
};

const migrationHint =
  "В базе ещё нет таблицы чаевых. Прогони миграцию 202607090001_tips.sql и попробуй ещё раз.";

const tipSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.coerce.number().int(),
});

// Старт оплаты чаевых: клиент анонимный, без авторизации, платит прямо со
// страницы подтверждения записи. Создаём pending-строку у себя и в ЮKassa,
// затем уводим клиента на страницу оплаты. Статус подтверждает вебхук — так
// же, как и для PRO-подписки (источник истины — сам ЮKassa).
export async function startTipPaymentAction(
  _prevState: TipActionState,
  formData: FormData,
): Promise<TipActionState> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Чаевые пока недоступны: нужно подключение к Supabase.",
    };
  }

  if (!isYooKassaConfigured) {
    return {
      success: false,
      message: "Оплата пока недоступна: не настроены ключи ЮKassa.",
    };
  }

  const parsed = tipSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Проверь сумму чаевых и попробуй ещё раз." };
  }

  const { bookingId, amount } = parsed.data;

  if (!isValidTipAmount(amount)) {
    return {
      success: false,
      message: "Сумма чаевых должна быть от 50 до 30 000 ₽.",
    };
  }

  const admin = createSupabaseAdminClient();

  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select("id, profile_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    logError("Failed to load booking for tip", { bookingId, error: bookingError });
    return { success: false, message: "Не получилось найти запись." };
  }

  if (!bookingRow) {
    return { success: false, message: "Запись не найдена." };
  }

  const profileId = String(bookingRow.profile_id);

  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("username")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError || !profileRow) {
    logError("Failed to resolve username for tip return url", {
      bookingId,
      profileId,
      error: profileError,
    });
    return { success: false, message: "Не получилось найти страницу мастера." };
  }

  const username = String(profileRow.username ?? "");

  if (!username) {
    return { success: false, message: "Не получилось найти страницу мастера." };
  }

  const idempotenceKey = randomUUID();

  const { data: tipRow, error: insertError } = await admin
    .from("tips")
    .insert({
      booking_id: bookingId,
      profile_id: profileId,
      provider: "yookassa",
      amount,
      currency: "RUB",
      status: "pending",
      idempotence_key: idempotenceKey,
    })
    .select("id")
    .single();

  if (insertError || !tipRow) {
    if (isSupabaseMissingTableError(insertError, "tips")) {
      return { success: false, message: migrationHint };
    }
    logError("Failed to create tip row", { bookingId, profileId, error: insertError });
    return { success: false, message: "Не получилось начать оплату." };
  }

  let confirmationUrl: string | null = null;

  try {
    const payment = await createYooKassaPayment({
      amountRub: amount,
      description: "Чаевые мастеру okno",
      returnUrl: buildReturnUrl({ username, bookingId }),
      idempotenceKey,
      metadata: {
        kind: "tip",
        tipRowId: tipRow.id,
        profileId,
        bookingId,
      },
    });

    confirmationUrl = payment.confirmationUrl;

    await admin
      .from("tips")
      .update({
        provider_payment_id: payment.id,
        status: payment.status === "succeeded" ? "succeeded" : "pending",
        paid_at: payment.status === "succeeded" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tipRow.id);
  } catch (error) {
    logError("Failed to create YooKassa tip payment", {
      bookingId,
      profileId,
      error,
    });
    await admin
      .from("tips")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", tipRow.id);
    return {
      success: false,
      message: "ЮKassa не приняла платёж. Попробуй ещё раз.",
    };
  }

  await writeAuditLog({
    actorKind: "client",
    profileId,
    eventType: "tip.payment.started",
    targetType: "tip",
    targetId: String(tipRow.id),
    metadata: { amount, bookingId },
  });

  if (!confirmationUrl) {
    return {
      success: false,
      message: "ЮKassa не вернула ссылку на оплату. Попробуй ещё раз.",
    };
  }

  redirect(confirmationUrl);
}

function buildReturnUrl(input: { username: string; bookingId: string }) {
  const params = new URLSearchParams({
    bookingId: input.bookingId,
    tip: "processing",
  });
  return `${env.appUrl}/${input.username}/confirm?${params.toString()}`;
}
