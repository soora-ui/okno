import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pauseDayOptions, pauseMaxDaysPerYear } from "@/lib/feedback/config";
import { sendMasterTelegram } from "@/lib/notifications";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatSubscriptionUntil, resolveSubscription } from "@/lib/subscription";

// Пауза подписки. Мастер замораживает оплаченный тариф на 2 недели – 3 месяца:
// запись у клиентов закрывается, а оплаченные дни не сгорают.
//
// Устроено через сдвиг срока: на старте паузы subscription_until уезжает
// вперёд на длину паузы, и всё, что смотрит на этот срок, ведёт себя
// правильно без отдельных веток — автопродление не спишет раньше времени,
// напоминание о списании придёт перед новым сроком. Конец паузы не требует
// job: subscription_paused_until в прошлом просто перестаёт что-либо значить.

type PauseProfileRow = {
  id: string;
  workspace_id: string | null;
  subscription_tier: string | null;
  subscription_until: string | null;
  subscription_paused_until: string | null;
  created_at: string | null;
};

type PauseRow = {
  id: string;
  started_at: string;
  planned_until: string;
  ended_at: string | null;
};

export type PauseResult = { ok: true; message: string } | { ok: false; message: string };

async function loadProfile(supabase: SupabaseClient, profileId: string) {
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, workspace_id, subscription_tier, subscription_until, subscription_paused_until, created_at",
    )
    .eq("id", profileId)
    .maybeSingle();

  return (data as PauseProfileRow | null) ?? null;
}

// Сколько дней мастер уже был на паузе за последний год. Незакрытая пауза
// считается по плану: досрочный выход вернёт неиспользованное.
export async function pausedDaysLastYear(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  const yearAgo = DateTime.now().minus({ days: 365 });
  const { data } = await supabase
    .from("subscription_pauses")
    .select("id, started_at, planned_until, ended_at")
    .eq("profile_id", profileId)
    .gte("started_at", yearAgo.toUTC().toISO());

  return ((data ?? []) as PauseRow[]).reduce((total, pause) => {
    const start = DateTime.fromISO(pause.started_at);
    const end = DateTime.fromISO(pause.ended_at ?? pause.planned_until);
    return total + Math.max(0, Math.ceil(end.diff(start, "days").days));
  }, 0);
}

export async function startSubscriptionPause(input: {
  profileId: string;
  days: number;
}): Promise<PauseResult> {
  if (!pauseDayOptions.includes(input.days)) {
    return { ok: false, message: "Выбери срок паузы из списка." };
  }

  const supabase = createSupabaseAdminClient();
  const profile = await loadProfile(supabase, input.profileId);

  if (!profile) {
    return { ok: false, message: "Профиль не найден." };
  }

  const access = resolveSubscription({
    subscriptionTier: String(profile.subscription_tier ?? ""),
    subscriptionUntil: profile.subscription_until,
    subscriptionPausedUntil: profile.subscription_paused_until,
    joinedAt: profile.created_at,
  });

  if (access.pausedUntil) {
    return { ok: false, message: "Подписка уже на паузе." };
  }

  if (!access.isActive || access.isTrial || !access.planId) {
    return {
      ok: false,
      message: "Пауза доступна для оплаченного тарифа — в пробном периоде ставить на паузу нечего.",
    };
  }

  if (!profile.subscription_until) {
    return { ok: false, message: "У тебя бессрочный доступ — пауза ему не нужна." };
  }

  const usedDays = await pausedDaysLastYear(supabase, profile.id);

  if (usedDays + input.days > pauseMaxDaysPerYear) {
    const left = Math.max(0, pauseMaxDaysPerYear - usedDays);
    return {
      ok: false,
      message:
        left > 0
          ? `За год на паузе можно провести до ${pauseMaxDaysPerYear} дней, осталось ${left}. Выбери срок покороче.`
          : `За последний год пауза уже использована полностью (${pauseMaxDaysPerYear} дней).`,
    };
  }

  const now = DateTime.now();
  const pausedUntil = now.plus({ days: input.days }).toUTC().toISO()!;
  const newUntil = DateTime.fromISO(profile.subscription_until)
    .plus({ days: input.days })
    .toUTC()
    .toISO()!;

  // Условие на старый срок — защита от гонки с вебхуком оплаты: если срок
  // успел сдвинуться, пауза не наложится на устаревшее значение.
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ subscription_until: newUntil, subscription_paused_until: pausedUntil })
    .eq("id", profile.id)
    .eq("subscription_until", profile.subscription_until)
    .select("id");

  if (error || !updated || updated.length === 0) {
    logError("Pause: profile update failed", { profileId: profile.id, error });
    return { ok: false, message: "Не получилось поставить паузу. Попробуй ещё раз." };
  }

  const { error: pauseError } = await supabase.from("subscription_pauses").insert({
    profile_id: profile.id,
    started_at: now.toUTC().toISO(),
    planned_until: pausedUntil,
  });

  if (pauseError) {
    logError("Pause: history insert failed", { profileId: profile.id, error: pauseError });
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspace_id,
    eventType: "subscription.paused",
    targetType: "profile",
    targetId: profile.id,
    metadata: { days: input.days, pausedUntil, subscriptionUntil: newUntil },
  });

  return {
    ok: true,
    message: `Подписка на паузе до ${formatSubscriptionUntil(pausedUntil)}. Оплаченные дни сохранены — тариф будет действовать до ${formatSubscriptionUntil(newUntil)}.`,
  };
}

export async function endSubscriptionPause(input: { profileId: string }): Promise<PauseResult> {
  const supabase = createSupabaseAdminClient();
  const profile = await loadProfile(supabase, input.profileId);

  if (!profile?.subscription_paused_until || !profile.subscription_until) {
    return { ok: false, message: "Подписка не на паузе." };
  }

  const now = DateTime.now();
  const pausedUntil = DateTime.fromISO(profile.subscription_paused_until);

  if (pausedUntil <= now) {
    return { ok: false, message: "Пауза уже закончилась." };
  }

  // Возвращаем неиспользованный остаток паузы: срок сдвигался на всю её длину.
  const remaining = pausedUntil.diff(now);
  const newUntil = DateTime.fromISO(profile.subscription_until)
    .minus(remaining)
    .toUTC()
    .toISO()!;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ subscription_until: newUntil, subscription_paused_until: null })
    .eq("id", profile.id)
    .eq("subscription_until", profile.subscription_until)
    .select("id");

  if (error || !updated || updated.length === 0) {
    logError("Pause: resume failed", { profileId: profile.id, error });
    return { ok: false, message: "Не получилось снять паузу. Попробуй ещё раз." };
  }

  await supabase
    .from("subscription_pauses")
    .update({ ended_at: now.toUTC().toISO() })
    .eq("profile_id", profile.id)
    .is("ended_at", null);

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspace_id,
    eventType: "subscription.resumed",
    targetType: "profile",
    targetId: profile.id,
    metadata: { subscriptionUntil: newUntil },
  });

  return {
    ok: true,
    message: `С возвращением! Запись снова открыта, тариф действует до ${formatSubscriptionUntil(newUntil)}.`,
  };
}

// Фоновая часть: за сутки до конца паузы предупреждаем мастера, а истёкшие
// паузы закрываем в истории. Доступ от этого не зависит — он включается сам.
export async function processSubscriptionPauses(): Promise<{
  reminded: number;
  closed: number;
}> {
  const supabase = createSupabaseAdminClient();
  const now = DateTime.now();

  const { data: ending } = await supabase
    .from("subscription_pauses")
    .select("id, profile_id, planned_until")
    .is("ended_at", null)
    .is("ending_notified_at", null)
    .gt("planned_until", now.toUTC().toISO())
    .lte("planned_until", now.plus({ days: 1 }).toUTC().toISO())
    .limit(100);

  let reminded = 0;

  for (const pause of ending ?? []) {
    // Помечаем до отправки: дубль хуже пропущенного напоминания.
    await supabase
      .from("subscription_pauses")
      .update({ ending_notified_at: now.toUTC().toISO() })
      .eq("id", pause.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", pause.profile_id)
      .maybeSingle();

    const result = await sendMasterTelegram(
      profile?.telegram_chat_id ? String(profile.telegram_chat_id) : null,
      [
        "<b>Пауза заканчивается завтра</b>",
        "",
        `С ${formatSubscriptionUntil(String(pause.planned_until))} запись у клиентов снова откроется. Проверь расписание — в нём должны быть свободные окна.`,
      ].join("\n"),
    );

    if (result.ok) {
      reminded += 1;
    }
  }

  const { data: closed } = await supabase
    .from("subscription_pauses")
    .update({ ended_at: now.toUTC().toISO() })
    .is("ended_at", null)
    .lte("planned_until", now.toUTC().toISO())
    .select("id");

  return { reminded, closed: closed?.length ?? 0 };
}
