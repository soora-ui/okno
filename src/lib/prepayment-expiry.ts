import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Протухшие резервации предоплаты (Модуль 2 из okno-tz-rating-prepayment.md,
// ТЗ 2.6). Если клиент открыл оплату ЮKassa и не завершил её за отведенное
// время (prepayments.expires_at), освобождаем слот: помечаем предоплату
// expired и отменяем bookings, которые всё ещё pending_payment.
export async function expireStalePrepayments() {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: expiredPrepayments, error: expireError } = await admin
    .from("prepayments")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", nowIso)
    .select("id, booking_id");

  if (expireError) {
    throw new Error("Не получилось пометить протухшие предоплаты.");
  }

  const bookingIds = (expiredPrepayments ?? [])
    .map((row) => row.booking_id)
    .filter((value): value is string => Boolean(value));

  if (bookingIds.length === 0) {
    return { expiredPrepayments: 0, cancelledBookings: 0 };
  }

  const { data: cancelledBookings, error: cancelError } = await admin
    .from("bookings")
    .update({
      status: "cancelled_by_client",
      cancelled_at: nowIso,
    })
    .in("id", bookingIds)
    .eq("status", "pending_payment")
    .select("id");

  if (cancelError) {
    throw new Error("Не получилось освободить слоты протухших предоплат.");
  }

  return {
    expiredPrepayments: (expiredPrepayments ?? []).length,
    cancelledBookings: (cancelledBookings ?? []).length,
  };
}
