import { isNalogConfigured, isYooKassaConfigured } from "@/lib/env";
import { cancelNalogReceipt } from "@/lib/nalog/receipts";
import { readNalogRefundCursor, writeNalogRefundCursor } from "@/lib/nalog/state";
import { listYooKassaRefunds } from "@/lib/payments/yookassa";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Возврат денег отменяет доход: чек в «Моём налоге» надо аннулировать, иначе
// налог будет начислен на деньги, которых у нас нет.
//
// Возвраты по платежам платформы делаются руками в кабинете ЮKassa, никакого
// события в нашем коде при этом не происходит — поэтому единственный способ
// узнать о них — опрос /v3/refunds. Курсор (последний просмотренный возврат)
// лежит в nalog_sync_state.

// На сколько назад смотрим при самом первом прогоне: без курсора незачем
// поднимать всю историю магазина.
const FIRST_RUN_LOOKBACK_DAYS = 7;

// Возвраты создаются пачками редко — одной страницы почти всегда хватает, но
// цикл нужен, чтобы не потерять хвост после массового возврата.
const MAX_PAGES = 10;

export type NalogRefundSyncResult = {
  checked: number;
  cancelled: number;
  unmatched: number;
  partial: number;
  failed: number;
  skipped?: string;
};

export async function syncNalogRefunds(): Promise<NalogRefundSyncResult> {
  const result: NalogRefundSyncResult = {
    checked: 0,
    cancelled: 0,
    unmatched: 0,
    partial: 0,
    failed: 0,
  };

  if (!isNalogConfigured) {
    return { ...result, skipped: "not_configured" };
  }

  if (!isYooKassaConfigured) {
    return { ...result, skipped: "yookassa_not_configured" };
  }

  const supabase = createSupabaseAdminClient();

  let cursorFrom: string;
  try {
    cursorFrom =
      (await readNalogRefundCursor(supabase)) ??
      new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  } catch (error) {
    logError("Nalog: failed to read refund cursor", { error });
    return { ...result, skipped: "state_unavailable" };
  }

  let cursor: string | null = null;
  // Самый свежий просмотренный возврат. Сравниваем по времени, а не по
  // строке: ЮKassa вольна отдать `...Z` и `...+03:00` в одном ответе, и
  // лексикографический максимум тогда врёт.
  let newestMs = Date.parse(cursorFrom);
  let pagesExhausted = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let batch: Awaited<ReturnType<typeof listYooKassaRefunds>>;
    try {
      batch = await listYooKassaRefunds({ createdAtGte: cursorFrom, cursor });
    } catch (error) {
      // Курсор не двигаем: следующий прогон переспросит тот же интервал.
      logError("Nalog: failed to list YooKassa refunds", { error });
      return { ...result, skipped: "yookassa_unavailable" };
    }

    for (const refund of batch.items) {
      result.checked += 1;

      const createdMs = refund.createdAt ? Date.parse(refund.createdAt) : NaN;
      if (Number.isFinite(createdMs) && createdMs > newestMs) {
        newestMs = createdMs;
      }

      const outcome = await applyRefund(refund);
      result[outcome] += 1;
    }

    cursor = batch.nextCursor;
    if (!cursor) {
      pagesExhausted = true;
      break;
    }
  }

  // Сдвигаем курсор на миллисекунду вперёд от самого свежего возврата: ЮKassa
  // фильтрует по created_at.gte включительно, и без сдвига последний возврат
  // приезжал бы в каждом прогоне.
  //
  // Двигаем только после полного обхода без единой ошибки. ЮKassa отдаёт
  // список от свежих к старым, поэтому обрыв на середине означает, что часть
  // возвратов ещё не просмотрена, а сдвинутый курсор спрятал бы их навсегда:
  // чек остался бы неаннулированным, то есть налог начислился бы на
  // возвращённые деньги. Повторный разбор безвреден — аннулирование
  // идемпотентно.
  if (pagesExhausted && !result.failed && newestMs > Date.parse(cursorFrom)) {
    await writeNalogRefundCursor(supabase, new Date(newestMs + 1).toISOString());
  }

  if (result.cancelled) {
    logInfo("Nalog: cancelled receipts after refunds", { count: result.cancelled });
  }

  return result;
}

async function applyRefund(refund: {
  id: string;
  paymentId: string;
  amountValue: string | null;
}): Promise<"cancelled" | "unmatched" | "partial" | "failed"> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("nalog_receipts")
    .select("id, amount, status, refund_id")
    .eq("provider_payment_id", refund.paymentId)
    .maybeSingle();

  if (error) {
    logError("Nalog: failed to match refund to receipt", { refundId: refund.id, error });
    return "failed";
  }

  if (!data) {
    // Возврат по платежу, чек за который мы не выбивали (например, поток
    // выключен через NALOG_SOURCES). Аннулировать нечего.
    return "unmatched";
  }

  if (data.status === "cancelled") {
    return "unmatched";
  }

  const receiptAmount = Number(data.amount);
  const refundAmount = refund.amountValue ? Number(refund.amountValue) : receiptAmount;

  // Частичный возврат. В «Моём налоге» чек нельзя уменьшить — правильный путь
  // здесь: аннулировать старый и выбить новый на остаток. Делать это
  // автоматически опасно (ошибка стоит лишнего налога и разбирательства с
  // ФНС), поэтому зовём человека.
  if (refundAmount + 0.005 < receiptAmount) {
    logWarn("Nalog: partial refund needs manual receipt correction", {
      refundId: refund.id,
      paymentId: refund.paymentId,
      refundAmount,
      receiptAmount,
    });

    await writeAuditLog({
      actorKind: "system",
      eventType: "nalog.receipt.partial_refund",
      status: "failure",
      message: "Частичный возврат: чек нужно аннулировать и перевыставить вручную.",
      targetType: "nalog_receipt",
      targetId: String(data.id),
      metadata: { refundId: refund.id, refundAmount, receiptAmount },
    });

    return "partial";
  }

  const outcome = await cancelNalogReceipt({
    providerPaymentId: refund.paymentId,
    reason: "Возврат средств",
    refundId: refund.id,
  });

  if (outcome === "cancelled" || outcome === "not_registered") {
    return "cancelled";
  }

  if (outcome === "failed") {
    return "failed";
  }

  return "unmatched";
}
