import {
  type PlanId,
  autopayMaxAttempts,
  findBillingPeriodByDays,
  isPlanId,
  planPeriodDays,
} from "@/config/plans";
import { logError } from "@/lib/observability/logger";
import { isSupabaseMissingColumnError } from "@/lib/supabase/auth-errors";
import { renewalKeyMoment } from "@/lib/subscription-period";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { YooKassaPaymentMethod } from "@/lib/payments/yookassa";

// Автопродление подписки: привязанная карта мастера и его согласие на
// списание. Модуль знает только про наши таблицы — вызовы к ЮKassa живут
// в src/lib/payments/yookassa.ts.
//
// Отвязать карту на стороне ЮKassa нельзя: API удаления сохранённого способа
// оплаты у них нет. Поэтому «отвязка» — это удаление строки здесь плюс
// autopay_enabled=false в профиле, и именно от них зависит, спишем мы деньги
// или нет. Всё, что списывает (job продления), обязано проверять и то, и
// другое. Строка удаляется, а не архивируется: политика конфиденциальности
// обещает мастеру удаление сведений о карте, след остаётся в audit_logs.

type SupabaseClient =
  | Awaited<ReturnType<typeof createSupabaseServerClient>>
  | ReturnType<typeof createSupabaseAdminClient>;

export type SubscriptionPaymentMethod = {
  id: string;
  profileId: string;
  providerPaymentMethodId: string;
  cardLast4: string | null;
  cardType: string | null;
  cardExpiryMonth: string | null;
  cardExpiryYear: string | null;
  createdAt: string;
};

const METHOD_COLUMNS =
  "id, profile_id, provider_payment_method_id, card_last4, card_type, card_expiry_month, card_expiry_year, created_at";

function mapMethodRow(row: Record<string, unknown>): SubscriptionPaymentMethod {
  const str = (value: unknown) =>
    typeof value === "string" && value ? value : null;

  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    providerPaymentMethodId: String(row.provider_payment_method_id),
    cardLast4: str(row.card_last4),
    cardType: str(row.card_type),
    cardExpiryMonth: str(row.card_expiry_month),
    cardExpiryYear: str(row.card_expiry_year),
    createdAt: String(row.created_at),
  };
}

export async function getActiveSubscriptionPaymentMethod(
  supabase: SupabaseClient,
  profileId: string,
): Promise<SubscriptionPaymentMethod | null> {
  const { data, error } = await supabase
    .from("subscription_payment_methods")
    .select(METHOD_COLUMNS)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    logError("Failed to load subscription payment method", { profileId, error });
    return null;
  }

  return data ? mapMethodRow(data as Record<string, unknown>) : null;
}

// Всё, что нужно настройкам, чтобы показать состояние автопродления.
export type AutopayState = {
  enabled: boolean;
  planId: PlanId | null;
  // Каким периодом продлеваем. Кабинет обязан показывать именно его: у
  // оплатившего год «спишем 6870 ₽» без «за 360 дней» выглядит ошибкой.
  periodDays: number;
  method: SubscriptionPaymentMethod | null;
  failedAttempts: number;
  // Мастер просил автопродление при оплате, оплата прошла, а карта не
  // привязалась. Молчать об этом нельзя: он поставил галочку и вправе
  // считать, что всё включилось.
  requestFailed: boolean;
  // Автопродление работало и оборвалось само: списания не прошли столько раз
  // подряд, что мы сдались и удалили карту. От отвязки по кнопке отличается
  // тем, что мастер этого не хотел — и в кабинете должен увидеть причину, а
  // не молча обнаружить, что подписка кончилась.
  lapsed: boolean;
};

export const emptyAutopayState: AutopayState = {
  enabled: false,
  planId: null,
  periodDays: planPeriodDays,
  method: null,
  failedAttempts: 0,
  requestFailed: false,
  lapsed: false,
};

export async function getAutopayState(
  supabase: SupabaseClient,
  profileId: string,
): Promise<AutopayState> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "autopay_enabled, autopay_plan, autopay_period_days, autopay_failed_attempts, autopay_detached_at",
    )
    .eq("id", profileId)
    .maybeSingle();

  // Миграция автопродления ещё не прогнана — показываем «выключено» вместо
  // падения настроек целиком.
  if (error || !data) {
    if (error && !isSupabaseMissingColumnError(error)) {
      logError("Failed to load autopay state", { profileId, error });
    }
    return emptyAutopayState;
  }

  const enabled = data.autopay_enabled === true;
  const failedAttempts = Number(data.autopay_failed_attempts ?? 0);

  return {
    enabled,
    planId: isPlanId(data.autopay_plan) ? data.autopay_plan : null,
    periodDays: findBillingPeriodByDays(
      Number(data.autopay_period_days ?? planPeriodDays),
    ).days,
    method: enabled ? await getActiveSubscriptionPaymentMethod(supabase, profileId) : null,
    failedAttempts,
    // Счётчик доходит до предела только по лестнице отказов: отвязка по
    // кнопке его обнуляет, успешная ручная оплата — тоже. Значит предел при
    // выключенном автопродлении однозначно означает «оборвалось само».
    lapsed: !enabled && failedAttempts >= autopayMaxAttempts,
    requestFailed: enabled
      ? false
      : await didAutopayRequestFail(supabase, profileId, {
          detachedAt: data.autopay_detached_at
            ? String(data.autopay_detached_at)
            : null,
        }),
  };
}

// Последняя оплата прошла с просьбой включить автопродление, но карта так и
// не привязалась. Смотрим только на последний платёж: если после него мастер
// оплатил ещё раз уже без галочки, значит он передумал, и напоминать не о чем.
//
// detachedAt отделяет «не привязалась» от «была и закончилась»: после того как
// мастер сам нажал «Отключить и отвязать» (или мы сдались после неудачных
// списаний), строки карты тоже нет — но говорить ему, что привязка не удалась,
// значит врать. Отметка новее платежа означает, что привязка существовала.
async function didAutopayRequestFail(
  supabase: SupabaseClient,
  profileId: string,
  options: { detachedAt: string | null },
): Promise<boolean> {
  const { data } = await supabase
    .from("subscription_payments")
    .select("metadata, created_at")
    .eq("profile_id", profileId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((data?.metadata as { autopay?: unknown } | null)?.autopay !== true) {
    return false;
  }

  if (!options.detachedAt) {
    return true;
  }

  return (
    new Date(options.detachedAt).getTime() < new Date(String(data?.created_at)).getTime()
  );
}

// Привязка карты после успешной оплаты. Upsert по profile_id: оплата новой
// картой затирает предыдущую, повторная доставка вебхука ничего не ломает, а
// мастер видит в настройках одну понятную карту, а не список.
export async function saveSubscriptionPaymentMethod(
  supabase: SupabaseClient,
  input: { profileId: string; method: YooKassaPaymentMethod },
): Promise<SubscriptionPaymentMethod | null> {
  const { data, error } = await supabase
    .from("subscription_payment_methods")
    .upsert(
      {
        profile_id: input.profileId,
        provider: "yookassa",
        provider_payment_method_id: input.method.id,
        card_last4: input.method.cardLast4,
        card_type: input.method.cardType,
        card_expiry_month: input.method.cardExpiryMonth,
        card_expiry_year: input.method.cardExpiryYear,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    )
    .select(METHOD_COLUMNS)
    .single();

  if (error || !data) {
    logError("Failed to save subscription payment method", {
      profileId: input.profileId,
      error,
    });
    return null;
  }

  return mapMethodRow(data as Record<string, unknown>);
}

// Отвязка карты. Всегда идёт в паре с autopay_enabled=false — держать
// согласие без карты незачем, а карту без согласия опасно.
export async function detachSubscriptionPaymentMethod(
  supabase: SupabaseClient,
  profileId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("subscription_payment_methods")
    .delete()
    .eq("profile_id", profileId);

  if (error) {
    logError("Failed to detach subscription payment method", { profileId, error });
    return false;
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      autopay_enabled: false,
      autopay_plan: null,
      autopay_period_days: null,
      autopay_failed_attempts: 0,
      autopay_next_attempt_at: null,
      autopay_detached_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (profileError) {
    logError("Failed to disable autopay on profile", { profileId, error: profileError });
    return false;
  }

  return true;
}

// Ключ идемпотентности автосписания. Детерминированный: оба параллельных
// прогона cron строят один ключ, второй insert падает на уникальном индексе
// subscription_payments_idempotence_key_idx — и второго платежа в ЮKassa не
// возникает. Тот же ключ уходит в Idempotence-Key самой ЮKassa: даже если
// наша строка каким-то образом задвоится, ЮKassa вернёт тот же платёж.
//
// В ключе три части: чей платёж, за какой период (момент, от которого
// продлеваем — он не меняется, пока продление не удалось) и номер попытки
// (ретрай после неудачи обязан быть новым платежом, а не повтором старого).
// Момент огрубляется до даты: ЮKassa ограничивает Idempotence-Key 64
// символами, а период всё равно 30 дней — двух продлений в один день не
// бывает. Исключение — тестовый укороченный период, там нужна минута
// (см. renewalKeyMoment).
export function buildRenewalIdempotenceKey(input: {
  profileId: string;
  renewFromIso: string;
  attempt: number;
}) {
  const moment = renewalKeyMoment(input.profileId, input.renewFromIso);
  return `r:${input.profileId}:${moment}:${input.attempt}`;
}
