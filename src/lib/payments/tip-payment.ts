import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createYooKassaPayment } from "@/lib/payments/yookassa";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";
import { isValidTipAmount } from "@/lib/tips";
import { env } from "@/lib/env";

// Ядро оплаты чаевых: создаёт строку у себя и платёж в ЮKassa, возвращает
// ссылку на оплату. Статус подтверждает вебхук — источник истины сам ЮKassa.
//
// Отдельно от server action, потому что уводить клиента на оплату нужно
// по-разному. Со страницы записи — обычным редиректом. Из мини-аппа Telegram
// редирект увёл бы платёжную страницу внутрь вебвью, где 3-D Secure и возврат
// в приложение работают непредсказуемо; там ссылку открывают наружу через
// openLink, а значит её надо получить, а не проследовать по ней.

export const tipsMigrationHint =
  "В базе ещё нет таблицы чаевых. Прогони миграцию 202607090001_tips.sql и попробуй ещё раз.";

export type StartTipPaymentResult =
  | { ok: true; confirmationUrl: string }
  | { ok: false; message: string };

export async function startTipPayment(input: {
  bookingId: string;
  amount: number;
}): Promise<StartTipPaymentResult> {
  const { bookingId, amount } = input;

  if (!isValidTipAmount(amount)) {
    return { ok: false, message: "Сумма чаевых должна быть от 50 до 30 000 ₽." };
  }

  const admin = createSupabaseAdminClient();

  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select("id, profile_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    logError("Failed to load booking for tip", { bookingId, error: bookingError });
    return { ok: false, message: "Не получилось найти запись." };
  }

  if (!bookingRow) {
    return { ok: false, message: "Запись не найдена." };
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
    return { ok: false, message: "Не получилось найти страницу мастера." };
  }

  const username = String(profileRow.username ?? "");

  if (!username) {
    return { ok: false, message: "Не получилось найти страницу мастера." };
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
      return { ok: false, message: tipsMigrationHint };
    }
    logError("Failed to create tip row", { bookingId, profileId, error: insertError });
    return { ok: false, message: "Не получилось начать оплату." };
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
      ok: false,
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
      ok: false,
      message: "ЮKassa не вернула ссылку на оплату. Попробуй ещё раз.",
    };
  }


  return { ok: true, confirmationUrl };
}

function buildReturnUrl(input: { username: string; bookingId: string }) {
  const params = new URLSearchParams({
    bookingId: input.bookingId,
    tip: "done",
  });

  return `${env.appUrl.replace(/\/$/, "")}/${input.username}/confirm?${params.toString()}`;
}
