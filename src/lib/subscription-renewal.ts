import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type PlanId,
  autopayMaxAttempts,
  calculatePeriodPriceRub,
  findBillingPeriodByDays,
  getPlan,
  isPlanId,
  planPeriodDays,
} from "@/config/plans";
import {
  notifySubscriptionAutopayFailed,
  notifySubscriptionAutopayUpcoming,
} from "@/lib/notifications";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError, logWarn } from "@/lib/observability/logger";
import {
  buildRenewalIdempotenceKey,
  getActiveSubscriptionPaymentMethod,
} from "@/lib/payments/subscription-autopay";
import {
  YooKassaRequestError,
  chargeSavedPaymentMethod,
} from "@/lib/payments/yookassa";
import { countActiveWorkspaceSeats } from "@/lib/repositories/team-repository";
import { maxReminderLeadDays, reminderLeadDuration } from "@/lib/subscription-period";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Автопродление подписки. Запускается фоновой job (/api/jobs/subscription-renewals):
// находит мастеров с включённым автопродлением, у которых оплаченный период
// закончился, и списывает следующий период с привязанной карты.
//
// Продление доступа здесь НЕ происходит. Списание создаёт обычную строку
// subscription_payments, а subscription_until двигает вебхук ЮKassa — та же
// ветка, что и для ручной оплаты. Так логика продления живёт в одном месте,
// и автосписание не может разойтись с ручной оплатой в расчёте дат.

// Пауза перед следующей попыткой, в днях: после первой неудачи ждём сутки,
// после второй — трое. Мастеру нужно время пополнить карту.
const RETRY_DELAYS_DAYS = [1, 3];

// Сколько профилей обрабатываем за один прогон. Cron ходит раз в час, так что
// очередь разгребается и без больших батчей, зато один зависший запрос к
// ЮKassa не растягивает job на часы.
const BATCH_SIZE = 50;

type RenewalProfileRow = {
  id: string;
  workspace_id: string | null;
  subscription_until: string | null;
  autopay_plan: string | null;
  autopay_period_days: number | null;
  autopay_failed_attempts: number | null;
  telegram_chat_id: string | null;
};

// Каким периодом продлевать этот профиль. Пусто — значит подписка оплачена до
// появления длинных периодов: там был месяц, месяц и продлеваем.
const renewalPeriod = (row: { autopay_period_days: number | null }) =>
  findBillingPeriodByDays(Number(row.autopay_period_days ?? planPeriodDays));

export type RenewalRunResult = {
  charged: number;
  failed: number;
  skipped: number;
  remindersSent: number;
};

// Неудачная попытка списания. Вызывается и из job (она видит статус сразу в
// ответе на списание), и из вебхука (если платёж отменился позже). От двойного
// счёта защищает вызывающий код: вебхук молчит, если строка платежа уже
// помечена canceled.
export async function registerFailedRenewal(
  supabase: SupabaseClient,
  input: { profileId: string; reason: string },
) {
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("autopay_failed_attempts, telegram_chat_id")
    .eq("id", input.profileId)
    .maybeSingle();

  const attempts = Number(profileRow?.autopay_failed_attempts ?? 0) + 1;
  const nowIso = new Date().toISOString();
  const giveUp = attempts >= autopayMaxAttempts;

  const retryDelayDays =
    RETRY_DELAYS_DAYS[attempts - 1] ?? RETRY_DELAYS_DAYS[RETRY_DELAYS_DAYS.length - 1];
  const nextAttemptAt = giveUp
    ? null
    : DateTime.now().plus({ days: retryDelayDays }).toUTC().toISO();

  const { error } = await supabase
    .from("profiles")
    .update({
      autopay_failed_attempts: attempts,
      autopay_last_attempt_at: nowIso,
      autopay_next_attempt_at: nextAttemptAt,
      // Больше не пробуем — снимаем и согласие: держать «автопродление
      // включено» после того, как мы сдались, значит врать в настройках.
      // autopay_detached_at отмечает, что привязка была и закончилась, —
      // иначе настройки скажут мастеру «карта не привязалась», хотя она
      // привязывалась и месяцами работала.
      // autopay_plan обнуляем здесь так же, как это делает кнопка отвязки:
      // два пути гасят одно состояние и должны оставлять профиль в одном
      // виде, иначе «какой тариф продлеваем» переживает само продление.
      ...(giveUp
        ? {
            autopay_enabled: false,
            autopay_plan: null,
            autopay_period_days: null,
            autopay_detached_at: nowIso,
          }
        : {}),
    })
    .eq("id", input.profileId);

  if (error) {
    logError("Failed to register autopay failure", {
      profileId: input.profileId,
      error,
    });
    return;
  }

  // Сдались — карту удаляем: держать способ оплаты, которым мы больше не
  // воспользуемся, значит хранить платёжные данные без причины. Оферта и
  // политика конфиденциальности обещают мастеру ровно это.
  if (giveUp) {
    await supabase
      .from("subscription_payment_methods")
      .delete()
      .eq("profile_id", input.profileId);
  }

  await writeAuditLog({
    actorKind: "system",
    profileId: input.profileId,
    eventType: giveUp ? "subscription.autopay.disabled" : "subscription.autopay.failed",
    targetType: "profile",
    targetId: input.profileId,
    metadata: { attempts, reason: input.reason, nextAttemptAt },
  });

  await notifySubscriptionAutopayFailed({
    chatId: profileRow?.telegram_chat_id ? String(profileRow.telegram_chat_id) : null,
    giveUp,
    nextAttemptLabel: nextAttemptAt
      ? DateTime.fromISO(nextAttemptAt).setLocale("ru").toFormat("d MMMM")
      : null,
  });
}

// Списание за один профиль. Возвращает, чем кончилось, — job только считает
// итоги, решения принимаются здесь.
async function renewOneProfile(
  admin: SupabaseClient,
  profile: RenewalProfileRow,
): Promise<"charged" | "failed" | "skipped"> {
  const planId = profile.autopay_plan;

  if (!isPlanId(planId)) {
    // Тариф потеряли (ручная правка в БД, старая строка) — списывать наугад
    // нельзя, выключаем автопродление и ждём ручной оплаты.
    logWarn("Autopay: profile has no valid plan, disabling", {
      profileId: profile.id,
      autopayPlan: planId,
    });
    await admin
      .from("profiles")
      .update({ autopay_enabled: false, autopay_next_attempt_at: null })
      .eq("id", profile.id);
    return "skipped";
  }

  const method = await getActiveSubscriptionPaymentMethod(admin, profile.id);

  if (!method) {
    // Карту отвязали, а согласие осталось — рассинхрон. Чинить в пользу
    // мастера: без карты списывать нечем.
    logWarn("Autopay: enabled without an active card, disabling", {
      profileId: profile.id,
    });
    await admin
      .from("profiles")
      .update({ autopay_enabled: false, autopay_next_attempt_at: null })
      .eq("id", profile.id);
    return "skipped";
  }

  const plan = getPlan(planId as PlanId);
  const renewFromIso = profile.subscription_until ?? new Date().toISOString();
  const attempt = Number(profile.autopay_failed_attempts ?? 0);

  let activeSeats = 0;
  try {
    activeSeats = profile.workspace_id
      ? await countActiveWorkspaceSeats(admin, profile.workspace_id)
      : 0;
  } catch (error) {
    // Сумму без числа сотрудников считать нельзя — можно списать меньше, чем
    // мастер занял мест. Отложим до следующего прогона.
    logError("Autopay: failed to count workspace seats", {
      profileId: profile.id,
      error,
    });
    return "skipped";
  }

  const period = renewalPeriod(profile);
  const amountRub = calculatePeriodPriceRub(planId as PlanId, period.id, activeSeats);
  const idempotenceKey = buildRenewalIdempotenceKey({
    profileId: profile.id,
    renewFromIso,
    attempt,
  });

  const { data: paymentRow, error: insertError } = await admin
    .from("subscription_payments")
    .insert({
      profile_id: profile.id,
      provider: "yookassa",
      kind: "subscription",
      plan: planId,
      amount: amountRub,
      currency: "RUB",
      period_days: period.days,
      status: "pending",
      idempotence_key: idempotenceKey,
      is_recurring: true,
      payment_method_id: method.id,
      metadata: {
        activeSeats,
        includedSeats: plan.includedSeats,
        attempt,
        billingPeriod: period.id,
      },
    })
    .select("id")
    .single();

  if (insertError || !paymentRow) {
    // 23505 — уникальный индекс по idempotence_key: этот период уже кто-то
    // взял в работу (параллельный прогон cron). Не ошибка, просто не наша
    // очередь.
    if ((insertError as { code?: string } | null)?.code === "23505") {
      return "skipped";
    }

    logError("Autopay: failed to create payment row", {
      profileId: profile.id,
      error: insertError,
    });
    return "skipped";
  }

  const attemptedAtIso = new Date().toISOString();
  await admin
    .from("profiles")
    .update({ autopay_last_attempt_at: attemptedAtIso })
    .eq("id", profile.id);

  try {
    const payment = await chargeSavedPaymentMethod({
      paymentMethodId: method.providerPaymentMethodId,
      amountRub,
      description: `okno «${plan.title}» — продление на ${period.days} дней`,
      idempotenceKey,
      merchantCustomerId: profile.id,
      metadata: {
        profileId: profile.id,
        paymentRowId: paymentRow.id,
        plan: planId,
        recurring: true,
      },
    });

    await admin
      .from("subscription_payments")
      .update({
        provider_payment_id: payment.id,
        // Подписку продлевает вебхук — здесь фиксируем только отказ, чтобы не
        // ждать уведомления сутки. Успех оставляем pending: строку закроет
        // вебхук, он же двигает subscription_until.
        status: payment.status === "canceled" ? "canceled" : "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRow.id);

    if (payment.status === "canceled") {
      await registerFailedRenewal(admin, {
        profileId: profile.id,
        reason: payment.cancellationReason ?? "canceled",
      });
      return "failed";
    }

    return "charged";
  } catch (error) {
    await admin
      .from("subscription_payments")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", paymentRow.id);

    // 4xx от ЮKassa — привязка мертва (карту закрыли, срок истёк). Ретраить
    // нечего, гасим сразу: autopayMaxAttempts здесь только оттянет неизбежное.
    if (error instanceof YooKassaRequestError && error.isPermanent) {
      logWarn("Autopay: payment method rejected by YooKassa", {
        profileId: profile.id,
        status: error.status,
      });
      await admin
        .from("profiles")
        .update({
          autopay_enabled: false,
          autopay_next_attempt_at: null,
          autopay_failed_attempts: autopayMaxAttempts,
          autopay_detached_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      await admin
        .from("subscription_payment_methods")
        .delete()
        .eq("id", method.id);

      await writeAuditLog({
        actorKind: "system",
        profileId: profile.id,
        eventType: "subscription.autopay.disabled",
        targetType: "subscription_payment_method",
        targetId: method.id,
        metadata: { reason: "payment_method_rejected", status: error.status },
      });

      await notifySubscriptionAutopayFailed({
        chatId: profile.telegram_chat_id,
        giveUp: true,
        nextAttemptLabel: null,
      });

      return "failed";
    }

    logError("Autopay: charge request failed", { profileId: profile.id, error });
    await registerFailedRenewal(admin, {
      profileId: profile.id,
      reason: error instanceof Error ? error.message : "request_failed",
    });
    return "failed";
  }
}

// Предупреждение за REMINDER_DAYS_BEFORE дней до списания. Мастер должен
// узнать сумму заранее — и успеть отвязать карту, если продлевать не хочет.
async function sendUpcomingReminders(admin: SupabaseClient): Promise<number> {
  // Окно берём по самому раннему предупреждению из возможных, а точный порог
  // для каждого профиля считается ниже — он зависит от длины его периода.
  const windowEndIso = DateTime.now().plus({ days: maxReminderLeadDays }).toUTC().toISO()!;

  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, workspace_id, subscription_until, autopay_plan, autopay_period_days, telegram_chat_id",
    )
    .eq("autopay_enabled", true)
    .is("autopay_reminder_sent_at", null)
    .not("subscription_until", "is", null)
    .gt("subscription_until", new Date().toISOString())
    .lte("subscription_until", windowEndIso)
    .limit(BATCH_SIZE);

  if (error) {
    logError("Autopay: failed to select profiles for reminders", { error });
    return 0;
  }

  let sent = 0;

  for (const row of (data ?? []) as RenewalProfileRow[]) {
    if (!isPlanId(row.autopay_plan)) {
      continue;
    }

    // Точный порог для этого профиля: выборка выше взяла максимальное окно,
    // у месячной оплаты оно короче, а у тестового укороченного периода
    // измеряется секундами.
    const period = renewalPeriod(row);
    const dueAt = DateTime.fromISO(String(row.subscription_until));
    if (dueAt > DateTime.now().plus(reminderLeadDuration(row.id, period.days))) {
      continue;
    }

    let activeSeats = 0;
    try {
      activeSeats = row.workspace_id
        ? await countActiveWorkspaceSeats(admin, row.workspace_id)
        : 0;
    } catch {
      continue;
    }

    // Отметку ставим до отправки: Telegram может ответить ошибкой, но
    // повторять уведомление каждый час — хуже, чем не отправить его вовсе.
    await admin
      .from("profiles")
      .update({ autopay_reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id);

    await notifySubscriptionAutopayUpcoming({
      chatId: row.telegram_chat_id,
      amountRub: calculatePeriodPriceRub(
        row.autopay_plan as PlanId,
        period.id,
        activeSeats,
      ),
      periodDays: period.days,
      dateLabel: DateTime.fromISO(String(row.subscription_until))
        .setLocale("ru")
        .toFormat("d MMMM"),
    });

    sent += 1;
  }

  return sent;
}

export async function renewDueSubscriptions(): Promise<RenewalRunResult> {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const remindersSent = await sendUpcomingReminders(admin);

  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, workspace_id, subscription_until, autopay_plan, autopay_period_days, autopay_failed_attempts, telegram_chat_id",
    )
    .eq("autopay_enabled", true)
    .not("subscription_until", "is", null)
    .lte("subscription_until", nowIso)
    // Ретрай после неудачи ждёт своей даты, первая попытка идёт сразу.
    .or(`autopay_next_attempt_at.is.null,autopay_next_attempt_at.lte.${nowIso}`)
    .order("subscription_until")
    .limit(BATCH_SIZE);

  if (error) {
    throw new Error("Не получилось выбрать подписки для автопродления.");
  }

  const result: RenewalRunResult = {
    charged: 0,
    failed: 0,
    skipped: 0,
    remindersSent,
  };

  for (const row of (data ?? []) as RenewalProfileRow[]) {
    const outcome = await renewOneProfile(admin, row);
    result[outcome] += 1;
  }

  return result;
}
