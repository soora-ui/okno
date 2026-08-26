import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type PlanId,
  calculateSeatTopUpRub,
  findBillingPeriodByDays,
  getPlan,
  planPeriodDays,
  seatTopUpThresholdDays,
} from "@/config/plans";
import { logError } from "@/lib/observability/logger";
import { countActiveWorkspaceSeats } from "@/lib/repositories/team-repository";
import { isSupabaseMissingColumnError } from "@/lib/supabase/auth-errors";

// Места сотрудников внутри оплаченного периода.
//
// Доплата за сотрудника всегда входила в следующий платёж: добавили мастера в
// середине месяца — заплатите за него со следующего периода. При оплате на
// месяц это стоит сервису максимум тридцати дней, и трогать это правило
// незачем. При оплате на год то же правило означало бы, что студия покупает
// год на одного мастера и весь год держит команду любого размера бесплатно.
//
// Поэтому правило дополнено, а не заменено: доплата входит в следующий платёж,
// но если до него больше расчётного периода, место оплачивается сразу — за
// оставшиеся дни и с той же скидкой, что у оплаченного периода.

export type SeatBalance = {
  activeSeats: number;
  // Сколько мест закрыто: включённые в тариф и оплаченные сверх них.
  coveredSeats: number;
  unpaidSeats: number;
  // Сколько дней оплаченного периода осталось.
  remainingDays: number;
  // Длина оплаченного периода — от неё зависит скидка на доплату.
  periodDays: number;
  // Сколько стоит закрыть неоплаченные места до конца периода.
  amountRub: number;
  // Доплата обязательна прямо сейчас: остаток периода длиннее расчётного.
  topUpRequired: boolean;
};

export const emptySeatBalance: SeatBalance = {
  activeSeats: 0,
  coveredSeats: 0,
  unpaidSeats: 0,
  remainingDays: 0,
  periodDays: planPeriodDays,
  amountRub: 0,
  topUpRequired: false,
};

export type SeatBalanceInput = {
  profileId: string;
  workspaceId: string;
  planId: PlanId | null;
  subscriptionUntil: string | null;
  // Сколько мест добавится сверх текущих. Форма создания сотрудника
  // спрашивает про ещё не созданного человека, и считать нужно с ним.
  extraSeats?: number;
};

export async function loadSeatBalance(
  supabase: SupabaseClient,
  input: SeatBalanceInput,
): Promise<SeatBalance> {
  // Пробный период и неоплаченный доступ мест не продают: платить не за что,
  // и доплате взяться неоткуда.
  if (!input.planId || !input.subscriptionUntil || !input.workspaceId) {
    return emptySeatBalance;
  }

  const plan = getPlan(input.planId);

  if (!plan.capabilities.includes("team")) {
    return emptySeatBalance;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_paid_seats, subscription_period_days")
    .eq("id", input.profileId)
    .maybeSingle();

  // Миграция длинных периодов ещё не прогнана — ведём себя как раньше:
  // доплата входит в следующий платёж, посреди периода ничего не требуем.
  if (error || !data) {
    if (error && !isSupabaseMissingColumnError(error)) {
      logError("Failed to load seat balance", { profileId: input.profileId, error });
    }
    return emptySeatBalance;
  }

  let activeSeats = 0;
  try {
    activeSeats =
      (await countActiveWorkspaceSeats(supabase, input.workspaceId)) +
      Math.max(0, input.extraSeats ?? 0);
  } catch (seatError) {
    logError("Failed to count seats for seat balance", {
      profileId: input.profileId,
      error: seatError,
    });
    return emptySeatBalance;
  }

  const periodDays = Number(data.subscription_period_days ?? planPeriodDays);
  const paidSeats = Number(data.subscription_paid_seats ?? 0);
  const coveredSeats = Math.max(plan.includedSeats, paidSeats);
  const unpaidSeats = Math.max(0, activeSeats - coveredSeats);

  const until = DateTime.fromISO(input.subscriptionUntil);
  const remainingDays = until.isValid
    ? Math.max(0, Math.ceil(until.diff(DateTime.now(), "days").days))
    : 0;

  const discountPercent = findBillingPeriodByDays(periodDays).discountPercent;
  const amountRub = calculateSeatTopUpRub({
    seats: unpaidSeats,
    remainingDays,
    discountPercent,
  });

  return {
    activeSeats,
    coveredSeats,
    unpaidSeats,
    remainingDays,
    periodDays,
    amountRub,
    topUpRequired: unpaidSeats > 0 && remainingDays > seatTopUpThresholdDays,
  };
}
