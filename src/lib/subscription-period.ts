import { planPeriodDays, reminderLeadDaysFor } from "@/config/plans";
import { env } from "@/lib/env";
import { logWarn } from "@/lib/observability/logger";

// Укороченный расчётный период для проверки автопродления вживую. Ждать
// тридцать дней, чтобы увидеть одно списание, невозможно, поэтому период
// можно сжать до минут — но только для перечисленных профилей.
//
// Серверный модуль: витрина, оферта и тексты в интерфейсе по-прежнему читают
// planPeriodDays и говорят про 30 дней. В тестовом режиме подпись «/ 30 дней»
// в настройках расходится с реальностью — это цена того, что переключатель не
// лезет в продуктовые тексты.
//
// БЕЗОПАСНОСТЬ. Режим включается двумя переменными сразу, и пустой список
// профилей означает «выключено». Это сделано намеренно: одна забытая
// переменная в окружении не должна приводить к тому, что живой мастер купит
// подписку на минуту и получит списание через минуту.
//   SUBSCRIPTION_TEST_PERIOD_MINUTES=1
//   SUBSCRIPTION_TEST_PERIOD_PROFILE_IDS=<uuid>,<uuid>
// После проверки обе переменные убрать.

const MAX_TEST_MINUTES = 60;

function parseTestMinutes(): number | null {
  const raw = Number(env.subscriptionTestPeriodMinutes);

  if (!Number.isInteger(raw) || raw < 1 || raw > MAX_TEST_MINUTES) {
    return null;
  }

  return raw;
}

const testMinutes = parseTestMinutes();

// Потолок на размер списка. Тестовый период — инструмент на два-три
// собственных профиля; список длиннее означает, что переменную выставили
// пачкой (или подставили выборку из базы), и это уже не проверка, а
// сокращение оплаченного периода живым мастерам. В таком случае режим не
// включается вовсе.
const MAX_TEST_PROFILES = 3;

const requestedProfileIds = (env.subscriptionTestPeriodProfileIds ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const isProfileListSane = requestedProfileIds.length <= MAX_TEST_PROFILES;

if (testMinutes !== null && !isProfileListSane) {
  logWarn("Subscription test period disabled: profile list is too long", {
    profiles: requestedProfileIds.length,
    max: MAX_TEST_PROFILES,
  });
}

const testProfileIds = new Set(isProfileListSane ? requestedProfileIds : []);

export const isSubscriptionTestPeriodConfigured =
  testMinutes !== null && testProfileIds.size > 0;

export function isTestPeriodProfile(profileId: string): boolean {
  return isSubscriptionTestPeriodConfigured && testProfileIds.has(profileId);
}

// Насколько продлевать подписку. В обычном режиме — оплаченные дни из строки
// платежа, в тестовом — минуты.
export function subscriptionPeriodDuration(
  profileId: string,
  periodDays: number,
): { days: number } | { minutes: number } {
  if (!isTestPeriodProfile(profileId)) {
    return { days: periodDays };
  }

  logWarn("Subscription test period is active for profile", {
    profileId,
    minutes: testMinutes,
  });

  return { minutes: testMinutes! };
}

// За сколько до списания предупреждать — сами числа лежат в конфиге тарифов,
// потому что их же показывает кабинет.
export { maxReminderLeadDays, reminderLeadDays } from "@/config/plans";

// В тестовом режиме — полминуты, иначе напоминание будет уходить сразу после
// каждого продления и проверять по нему будет нечего.
export function reminderLeadDuration(
  profileId: string,
  periodDays: number = planPeriodDays,
): { days: number } | { seconds: number } {
  return isTestPeriodProfile(profileId)
    ? { seconds: 30 }
    : { days: reminderLeadDaysFor(periodDays) };
}

// Гранулярность ключа идемпотентности автосписания. В обычном режиме хватает
// даты: двух продлений в одни сутки не бывает. В тестовом периоды идут
// минутами, и по дате все продления одного дня слиплись бы в один ключ —
// второе списание молча не состоялось бы.
export function renewalKeyMoment(profileId: string, renewFromIso: string): string {
  return isTestPeriodProfile(profileId)
    ? renewFromIso.slice(0, 16)
    : renewFromIso.slice(0, 10);
}
