import type { SupabaseClient } from "@supabase/supabase-js";
import { env, isNalogConfigured } from "@/lib/env";
import {
  NalogAuthError,
  NalogRequestError,
  type NalogCancelReason,
  type NalogClient,
} from "@/lib/nalog/client";
import {
  createPlatformNalogClient,
  nalogMigrationHint,
  writeNalogLastError,
} from "@/lib/nalog/state";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";

// Очередь чеков НПД. Платёж кладётся сюда в момент, когда ЮKassa подтвердила
// успех, а выбивает чек фоновая job — см. src/app/api/jobs/nalog-receipts.
//
// Почему не сразу из вебхука: кабинет ФНС падает и тормозит заметно чаще
// нашего приложения, а вебхук ЮKassa обязан ответить быстро, иначе она начнёт
// слать повторы. Закон это позволяет: по безналичным расчётам чек НПД
// формируется не позднее 9-го числа следующего месяца (ч. 3 ст. 14
// 422-ФЗ) — минуты задержки роли не играют.

// Доход платформы — только то, что мастер платит нам за сервис: подписка и
// доплата за места в команде.
//
// Деньги клиентов (предоплата, чаевые, сертификаты) доходом платформы не
// являются и в чек НПД попадать не должны: они идут в магазин мастера, чеки
// по ним — его обязанность. Чаевые переезжают на CloudTips (okno-todo.md).
export type NalogReceiptSource = "subscription" | "seat";

const ALL_SOURCES: NalogReceiptSource[] = ["subscription", "seat"];

// Какие потоки выбивают чек. По умолчанию оба; NALOG_SOURCES нужен, если
// доплату за места решено проводить иначе (см. docs/nalog-setup.md).
export const enabledNalogSources: NalogReceiptSource[] = (() => {
  const raw = env.nalogSources?.trim();
  if (!raw) {
    return ALL_SOURCES;
  }

  const requested = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const known = ALL_SOURCES.filter((source) => requested.includes(source));
  const unknown = requested.filter(
    (value) => !ALL_SOURCES.includes(value as NalogReceiptSource),
  );

  if (unknown.length) {
    logWarn("Nalog: unknown values in NALOG_SOURCES", { unknown });
  }

  return known;
})();

// Сколько раз пробуем выбить чек, прежде чем позвать человека. С паузами ниже
// последняя попытка приходится примерно на вторые сутки — этого хватает,
// чтобы пережить любой разумный простой кабинета ФНС.
const MAX_ATTEMPTS = 8;

const RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 240, 720, 720];

// За один прогон job. Кабинет не любит частых запросов, а чеков за десять
// минут набегает единицы.
const PROCESS_BATCH = 20;

// На сколько строка помечается «в работе», пока job её обрабатывает. Больше
// таймаута запроса к кабинету (30 с) с запасом на поиск уже выбитого чека,
// но меньше периода cron — застрявшая строка вернётся в очередь сама.
const CLAIM_LEASE_MINUTES = 5;

// attempts — номер только что сделанной попытки, счёт с единицы.
function nextAttemptAt(attempts: number) {
  const minutes =
    RETRY_DELAYS_MINUTES[Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

// Наименование услуги в чеке. К человеческому описанию добавляется хвост
// платежа ЮKassa — и это не украшение.
//
// Поиск уже выбитого чека (findIncome) сверяет наименование и сумму: без
// хвоста два мастера, купившие один тариф в одну неделю, дают неотличимые
// строки, и повторная попытка по второму платежу нашла бы чек первого и
// закрыла бы строку чужим номером. Доход при этом занизился бы молча.
function buildReceiptName(description: string, providerPaymentId: string) {
  const reference = providerPaymentId.replace(/-/g, "").slice(-6);
  return reference ? `${description}, платёж ${reference}` : description;
}

export type QueueNalogReceiptInput = {
  source: NalogReceiptSource;
  sourceId: string | null;
  providerPaymentId: string;
  profileId: string | null;
  amountRub: number;
  // Наименование услуги в чеке. Видно плательщику, поэтому пишем понятное.
  description: string;
  // Момент оплаты. Если не передан — сейчас.
  operationTime?: Date;
};

// Поставить платёж в очередь на чек.
//
// Никогда не бросает: вызывается из вебхука ЮKassa и из подборщика зависших
// платежей, и ни один из них не должен падать из-за налоговой. Повторный вызов
// по тому же платежу безвреден — unique по provider_payment_id.
//
// Клиент берётся сервисный, а не передаётся вызывающим: очередь чеков закрыта
// RLS наглухо, и вызов с пользовательским клиентом молча терял бы доход.
export async function queueNalogReceipt(input: QueueNalogReceiptInput): Promise<void> {
  if (!isNalogConfigured) {
    return;
  }

  if (!enabledNalogSources.includes(input.source)) {
    return;
  }

  if (!(input.amountRub > 0)) {
    logWarn("Nalog: skipped receipt for non-positive amount", {
      providerPaymentId: input.providerPaymentId,
      source: input.source,
    });
    return;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("nalog_receipts").upsert(
      {
        source: input.source,
        source_id: input.sourceId,
        provider_payment_id: input.providerPaymentId,
        profile_id: input.profileId,
        amount: input.amountRub,
        description: buildReceiptName(input.description, input.providerPaymentId),
        operation_time: (input.operationTime ?? new Date()).toISOString(),
      },
      { onConflict: "provider_payment_id", ignoreDuplicates: true },
    );

    if (error) {
      if (isSupabaseMissingTableError(error, "nalog_receipts")) {
        logError("Nalog: receipts table is missing", { hint: nalogMigrationHint });
        return;
      }
      throw error;
    }
  } catch (error) {
    // Потерянный чек хуже незамеченной ошибки: платёж прошёл, а дохода в
    // кабинете не появится. Лог — единственное, что здесь можно сделать, не
    // подставив ответ вебхука.
    logError("Nalog: failed to queue receipt", {
      providerPaymentId: input.providerPaymentId,
      source: input.source,
      error,
    });
  }
}

type NalogReceiptRow = {
  id: string;
  source: NalogReceiptSource;
  provider_payment_id: string;
  profile_id: string | null;
  amount: number | string;
  description: string;
  operation_time: string;
  attempts: number;
};

export type NalogProcessResult = {
  processed: number;
  registered: number;
  recovered: number;
  retried: number;
  failed: number;
  skipped?: string;
};

// Выбивает чеки по всем строкам, у которых подошло время попытки.
export async function processPendingNalogReceipts(
  limit = PROCESS_BATCH,
): Promise<NalogProcessResult> {
  const result: NalogProcessResult = {
    processed: 0,
    registered: 0,
    recovered: 0,
    retried: 0,
    failed: 0,
  };

  if (!isNalogConfigured) {
    return { ...result, skipped: "not_configured" };
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("nalog_receipts")
    .select("id, source, provider_payment_id, profile_id, amount, description, operation_time, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at")
    .limit(limit);

  if (error) {
    if (isSupabaseMissingTableError(error, "nalog_receipts")) {
      logError("Nalog: receipts table is missing", { hint: nalogMigrationHint });
      return { ...result, skipped: "missing_table" };
    }
    logError("Nalog: failed to select pending receipts", { error });
    return { ...result, skipped: "select_failed" };
  }

  const rows = (data ?? []) as NalogReceiptRow[];
  if (!rows.length) {
    return result;
  }

  let client: NalogClient;
  try {
    client = await createPlatformNalogClient(supabase);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    logError("Nalog: cannot create client", { error: cause });
    await writeNalogLastError(supabase, message).catch(() => {});
    return { ...result, skipped: "client_unavailable" };
  }

  for (const row of rows) {
    // Захват строки. Два прогона job могут пересечься (кабинет тормозит,
    // следующий cron уже стартовал), и без этого оба выбили бы чек по одному
    // платежу. Условие `lte(next_attempt_at, now)` внутри update делает
    // проверку и захват одной атомарной операцией Postgres.
    if (!(await claimReceipt(supabase, row))) {
      continue;
    }

    result.processed += 1;

    try {
      const outcome = await registerReceipt(supabase, client, row);
      if (outcome === "registered") {
        result.registered += 1;
      } else {
        result.recovered += 1;
      }
    } catch (cause) {
      if (cause instanceof NalogAuthError) {
        // Вход отвалился — остальные строки упрутся ровно в то же самое.
        // Прерываем прогон и возвращаем текущую строку в очередь как есть:
        // попытку не засчитываем (мы даже не дошли до кабинета) и время
        // следующей не двигаем, чтобы после починки доступа чеки ушли сразу.
        const message = cause.message;
        logError("Nalog: authentication failed, run aborted", { error: cause });
        await writeNalogLastError(supabase, message).catch(() => {});
        await releaseReceipt(supabase, row, message);
        result.retried += 1;
        return result;
      }

      const message = cause instanceof Error ? cause.message : String(cause);
      const outcome = await touchFailure(supabase, row, message);
      if (outcome === "failed") {
        result.failed += 1;
      } else {
        result.retried += 1;
      }
    }
  }

  if (result.registered || result.recovered) {
    await writeNalogLastError(supabase, null).catch(() => {});
  }

  return result;
}

// Помечает строку «в работе», отодвигая время следующей попытки. Возвращает
// false, если её уже забрал параллельный прогон.
//
// Счётчик попыток растёт здесь, до похода в кабинет, а не по результату.
// Иначе неудачная запись результата (упала база ровно между выбитым чеком и
// update) оставила бы attempts=0, и следующий прогон пошёл бы сразу выбивать
// чек, минуя поиск уже выбитого — то есть сделал бы дубль.
async function claimReceipt(supabase: SupabaseClient, row: NalogReceiptRow) {
  const { data, error } = await supabase
    .from("nalog_receipts")
    .update({
      attempts: row.attempts + 1,
      next_attempt_at: new Date(Date.now() + CLAIM_LEASE_MINUTES * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .select("id");

  if (error) {
    logError("Nalog: failed to claim receipt row", { receiptRowId: row.id, error });
    return false;
  }

  return (data ?? []).length > 0;
}

// Возврат строки в очередь без сжигания попытки: до кабинета мы не дошли,
// поэтому откатываем и счётчик, увеличенный при захвате.
async function releaseReceipt(
  supabase: SupabaseClient,
  row: NalogReceiptRow,
  message: string,
) {
  await supabase
    .from("nalog_receipts")
    .update({
      attempts: row.attempts,
      next_attempt_at: new Date().toISOString(),
      last_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

// Один чек. Возвращает 'registered' (выбит сейчас) или 'recovered' (нашёлся в
// кабинете от прошлой оборванной попытки).
async function registerReceipt(
  supabase: SupabaseClient,
  client: NalogClient,
  row: NalogReceiptRow,
): Promise<"registered" | "recovered"> {
  const amountRub = Number(row.amount);
  const operationTime = new Date(row.operation_time);

  // Повторная попытка: сначала смотрим, не выбился ли чек в прошлый раз.
  // Кабинет умеет провести доход и оборвать ответ — если сразу выбить второй,
  // в декларации окажется двойной доход, а лишнее в НПД снимается руками.
  if (row.attempts > 0) {
    const existing = await findUnclaimedIncome(supabase, client, row, amountRub);

    if (existing) {
      await markRegistered(supabase, row, existing, "recovered");
      return "recovered";
    }
  }

  try {
    const income = await client.addIncome({
      name: row.description,
      amountRub,
      operationTime,
    });

    await markRegistered(supabase, row, income, "registered");
    return "registered";
  } catch (error) {
    // Ответ не дошёл, но доход мог пройти — проверяем прямо сейчас, не
    // откладывая до следующей попытки.
    if (error instanceof NalogRequestError) {
      const existing = await findUnclaimedIncome(supabase, client, row, amountRub).catch(
        () => null,
      );

      if (existing) {
        logWarn("Nalog: receipt was created despite an error response", {
          providerPaymentId: row.provider_payment_id,
        });
        await markRegistered(supabase, row, existing, "recovered");
        return "recovered";
      }
    }

    throw error;
  }
}

// Поиск ранее выбитого чека с проверкой, что его не занял другой платёж.
//
// Кабинет ищет только по наименованию и сумме, а наименование теоретически
// может совпасть (одинаковая сумма, одинаковый хвост платежа — маловероятно,
// но цена ошибки — незаявленный доход). Поэтому найденный чек принимается
// только если его номер ещё ни за кем не закреплён; иначе считаем, что чека
// нет, и выбиваем свой.
async function findUnclaimedIncome(
  supabase: SupabaseClient,
  client: NalogClient,
  row: NalogReceiptRow,
  amountRub: number,
) {
  const candidate = await client.findIncome({ name: row.description, amountRub });

  if (!candidate) {
    return null;
  }

  const { data, error } = await supabase
    .from("nalog_receipts")
    .select("id")
    .eq("receipt_uuid", candidate.receiptUuid)
    .neq("id", row.id)
    .maybeSingle();

  if (error) {
    logWarn("Nalog: failed to verify receipt ownership", {
      receiptUuid: candidate.receiptUuid,
      error,
    });
    return null;
  }

  if (data) {
    logWarn("Nalog: found receipt already claimed by another payment", {
      receiptUuid: candidate.receiptUuid,
      providerPaymentId: row.provider_payment_id,
    });
    return null;
  }

  return candidate;
}

async function markRegistered(
  supabase: SupabaseClient,
  row: NalogReceiptRow,
  income: { receiptUuid: string; receiptUrl: string },
  how: "registered" | "recovered",
) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("nalog_receipts")
    .update({
      status: "registered",
      receipt_uuid: income.receiptUuid,
      receipt_url: income.receiptUrl,
      registered_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", row.id);

  if (error) {
    // Чек в кабинете уже есть, а отметки у нас нет. Бросаем: строка вернётся
    // в очередь с засчитанной попыткой, и следующий прогон найдёт этот чек
    // через findIncome вместо того, чтобы выбивать второй.
    logError("Nalog: receipt registered but row update failed", {
      receiptUuid: income.receiptUuid,
      providerPaymentId: row.provider_payment_id,
      error,
    });
    throw new Error(
      `Чек ${income.receiptUuid} выбит, но не записан в nalog_receipts: ${error.message}`,
    );
  }

  logInfo("Nalog: receipt registered", {
    providerPaymentId: row.provider_payment_id,
    source: row.source,
    how,
  });

  await writeAuditLog({
    actorKind: "system",
    profileId: row.profile_id,
    eventType: "nalog.receipt.registered",
    targetType: "nalog_receipt",
    targetId: row.id,
    metadata: {
      source: row.source,
      amount: Number(row.amount),
      receiptUuid: income.receiptUuid,
      how,
    },
  });
}

async function touchFailure(
  supabase: SupabaseClient,
  row: NalogReceiptRow,
  message: string,
): Promise<"pending" | "failed"> {
  // Счётчик уже увеличен захватом строки — здесь только решение по нему.
  const attempts = row.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const now = new Date().toISOString();

  await supabase
    .from("nalog_receipts")
    .update({
      last_error: message.slice(0, 500),
      status: exhausted ? "failed" : "pending",
      next_attempt_at: nextAttemptAt(attempts),
      updated_at: now,
    })
    .eq("id", row.id);

  if (!exhausted) {
    logWarn("Nalog: receipt attempt failed, will retry", {
      providerPaymentId: row.provider_payment_id,
      attempts,
      message,
    });
    return "pending";
  }

  // Дальше только руками: зайти в кабинет и выбить чек самому. Событие в
  // журнале — чтобы это не потерялось среди логов.
  logError("Nalog: receipt gave up after retries", {
    providerPaymentId: row.provider_payment_id,
    attempts,
    message,
  });

  await writeAuditLog({
    actorKind: "system",
    profileId: row.profile_id,
    eventType: "nalog.receipt.failed",
    status: "failure",
    message: message.slice(0, 500),
    targetType: "nalog_receipt",
    targetId: row.id,
    metadata: { source: row.source, amount: Number(row.amount), attempts },
  });

  return "failed";
}

// Аннулирование чека по возврату. Вызывается синхронизацией возвратов
// (src/lib/nalog/refunds.ts) и вручную из скрипта.
export async function cancelNalogReceipt(input: {
  providerPaymentId: string;
  reason: NalogCancelReason;
  refundId?: string | null;
}): Promise<"cancelled" | "not_found" | "already_cancelled" | "not_registered" | "failed"> {
  if (!isNalogConfigured) {
    return "not_found";
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("nalog_receipts")
    .select("id, profile_id, status, receipt_uuid, amount, source")
    .eq("provider_payment_id", input.providerPaymentId)
    .maybeSingle();

  if (error) {
    logError("Nalog: failed to load receipt for cancellation", {
      providerPaymentId: input.providerPaymentId,
      error,
    });
    return "failed";
  }

  if (!data) {
    return "not_found";
  }

  if (data.status === "cancelled") {
    return "already_cancelled";
  }

  if (data.status !== "registered" || !data.receipt_uuid) {
    // Чек ещё не выбит. Убираем строку из очереди: выбивать доход, который уже
    // вернули, незачем.
    await supabase
      .from("nalog_receipts")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: `Возврат до выбивания чека: ${input.reason}`,
        refund_id: input.refundId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    return "not_registered";
  }

  try {
    const client = await createPlatformNalogClient(supabase);
    await client.cancelIncome(String(data.receipt_uuid), input.reason);
  } catch (cause) {
    logError("Nalog: failed to cancel receipt", {
      providerPaymentId: input.providerPaymentId,
      receiptUuid: data.receipt_uuid,
      error: cause,
    });
    return "failed";
  }

  const now = new Date().toISOString();
  await supabase
    .from("nalog_receipts")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancel_reason: input.reason,
      refund_id: input.refundId ?? null,
      updated_at: now,
    })
    .eq("id", data.id);

  await writeAuditLog({
    actorKind: "system",
    profileId: data.profile_id ? String(data.profile_id) : null,
    eventType: "nalog.receipt.cancelled",
    targetType: "nalog_receipt",
    targetId: String(data.id),
    metadata: {
      source: data.source,
      amount: Number(data.amount),
      receiptUuid: data.receipt_uuid,
      refundId: input.refundId ?? null,
    },
  });

  return "cancelled";
}
