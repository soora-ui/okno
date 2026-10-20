import { DateTime } from "luxon";
import { getPlan, isPlanId, trialDays } from "@/config/plans";
import { env, isSupabaseConfigured, isTelegramConfigured } from "@/lib/env";
import {
  type FeedbackKind,
  type FeedbackStatus,
  feedbackKindLabels,
  feedbackStatusLabels,
  promptCooldownDays,
  pulseFirstAfterPaidDays,
  reasonLabel,
  trialEndingLeadDays,
} from "@/lib/feedback/config";
import type { Profile } from "@/lib/mock-data";
import { sendMasterTelegram } from "@/lib/notifications";
import { logError, logWarn } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveSubscription, trialEndsAt } from "@/lib/subscription";
import { escapeTelegramHtml, sendTelegramMessage } from "@/lib/telegram/api";
import { canManageWorkspace } from "@/lib/workspace";

// Обратная связь мастеров: запись, уведомление админа, выбор опроса для
// кабинета и ответ автору. Всё под сервис-ролью — таблицы закрыты RLS без
// политик, и мастер видит только то, что ему отдаёт серверный код.

const appOrigin = env.appUrl.replace(/\/$/, "");

// Сколько бот ждёт подробностей после нажатия причины. Дольше нельзя: через
// час мастер напишет боту что-то своё, и оно молча уйдёт в отзыв.
const awaitingTextMinutes = 30;

export type FeedbackProfileSummary = Pick<
  Profile,
  | "id"
  | "username"
  | "subscriptionTier"
  | "subscriptionUntil"
  | "subscriptionPausedUntil"
  | "joinedAt"
>;

type ProfileRow = {
  id: string;
  username: string | null;
  subscription_tier: string | null;
  subscription_until: string | null;
  subscription_paused_until: string | null;
  created_at: string | null;
  telegram_chat_id: string | null;
};

const profileColumns =
  "id, username, subscription_tier, subscription_until, subscription_paused_until, created_at, telegram_chat_id";

function summaryFromRow(row: ProfileRow): FeedbackProfileSummary {
  return {
    id: row.id,
    username: row.username ?? "",
    subscriptionTier: (row.subscription_tier ?? "free") as Profile["subscriptionTier"],
    subscriptionUntil: row.subscription_until,
    subscriptionPausedUntil: row.subscription_paused_until,
    joinedAt: row.created_at ?? new Date().toISOString(),
  };
}

// Короткое описание состояния подписки — для админа и для context отзыва.
// Без имени и почты: сообщение уходит в групповой чат.
export function describeSubscriptionState(profile: FeedbackProfileSummary): string {
  const access = resolveSubscription(profile);
  const daysWithUs = Math.max(
    0,
    Math.floor(DateTime.now().diff(DateTime.fromISO(profile.joinedAt), "days").days),
  );
  const tenure = `${daysWithUs} дн. с нами`;

  if (access.pausedUntil) {
    return `пауза · ${tenure}`;
  }

  if (access.isTrial) {
    return `пробный период · ${tenure}`;
  }

  if (access.planId) {
    return `${getPlan(access.planId).title} · ${tenure}`;
  }

  return `без тарифа · ${tenure}`;
}

const kindIcons: Record<FeedbackKind, string> = {
  idea: "💡",
  bug: "🐞",
  cancel: "🚪",
  trial_ending: "⏳",
  trial_ended: "⌛",
  pulse: "📊",
};

function adminChatId() {
  return env.feedbackTelegramChatId || env.supportTelegramChatId || null;
}

async function notifyAdmin(input: {
  profile: FeedbackProfileSummary;
  kind: FeedbackKind;
  reason: string | null;
  message: string;
  isAddition?: boolean;
}) {
  const chatId = adminChatId();

  if (!isTelegramConfigured || !chatId) {
    return;
  }

  const reason = reasonLabel(input.kind, input.reason);
  const lines = [
    `${kindIcons[input.kind]} <b>${escapeTelegramHtml(feedbackKindLabels[input.kind])}</b>${
      input.isAddition ? " · дополнение" : ""
    }`,
    `@${escapeTelegramHtml(input.profile.username || "—")} · ${escapeTelegramHtml(
      describeSubscriptionState(input.profile),
    )}`,
  ];

  if (reason && !input.isAddition) {
    lines.push(`Ответ: <b>${escapeTelegramHtml(reason)}</b>`);
  }

  if (input.message) {
    lines.push("", escapeTelegramHtml(input.message));
  }

  const result = await sendTelegramMessage({
    chatId,
    text: lines.join("\n"),
    keyboard: appOrigin.startsWith("https://")
      ? [[{ text: "Открыть в админке", url: `${appOrigin}/admin/feedback` }]]
      : undefined,
  });

  if (!result.ok && !("skipped" in result && result.skipped)) {
    logWarn("Feedback: admin notification failed", { kind: input.kind });
  }
}

export async function recordFeedback(input: {
  profile: FeedbackProfileSummary;
  kind: FeedbackKind;
  channel: "site" | "telegram";
  reason?: string | null;
  message?: string;
  context?: Record<string, unknown>;
  // Ответ на опрос из журнала feedback_prompts — его закрываем как отвеченный.
  promptKey?: string | null;
  // Бот ждёт подробностей следующим сообщением.
  awaitText?: boolean;
}): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const message = (input.message ?? "").trim();
  const reason = input.reason ?? null;

  const { data, error } = await supabase
    .from("master_feedback")
    .insert({
      profile_id: input.profile.id,
      kind: input.kind,
      channel: input.channel,
      reason,
      message,
      context: {
        subscription: describeSubscriptionState(input.profile),
        ...input.context,
      },
      awaiting_text_until: input.awaitText
        ? DateTime.now().plus({ minutes: awaitingTextMinutes }).toUTC().toISO()
        : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    logError("Feedback: insert failed", { kind: input.kind, error });
    return null;
  }

  if (input.promptKey) {
    await supabase
      .from("feedback_prompts")
      .update({ answered_at: new Date().toISOString() })
      .eq("profile_id", input.profile.id)
      .eq("prompt_key", input.promptKey);
  }

  await notifyAdmin({ profile: input.profile, kind: input.kind, reason, message });

  return { id: String(data.id) };
}

// ---- Подробности из Telegram ----

// Мастер нажал причину в боте и следом написал текст. Возвращает true, если
// текст ушёл в отзыв и обычный ответ бота не нужен.
export async function attachTelegramFeedbackText(input: {
  profileId: string;
  text: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from("master_feedback")
    .select("id, kind, reason, message")
    .eq("profile_id", input.profileId)
    .gt("awaiting_text_until", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return false;
  }

  const text = input.text.trim().slice(0, 2000);
  const message = [String(row.message ?? ""), text].filter(Boolean).join("\n\n");

  await supabase
    .from("master_feedback")
    .update({
      message,
      awaiting_text_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  const profile = await loadProfileSummary(input.profileId);

  if (profile) {
    await notifyAdmin({
      profile,
      kind: row.kind as FeedbackKind,
      reason: (row.reason as string | null) ?? null,
      message: text,
      isAddition: true,
    });
  }

  return true;
}

async function loadProfileSummary(profileId: string) {
  const { data } = await createSupabaseAdminClient()
    .from("profiles")
    .select(profileColumns)
    .eq("id", profileId)
    .maybeSingle();

  return data ? summaryFromRow(data as ProfileRow) : null;
}

// ---- Опросы в кабинете ----

export type FeedbackPromptKind = "trial_ending" | "trial_ended" | "pulse";

export type FeedbackPrompt = {
  key: string;
  kind: FeedbackPromptKind;
};

type PromptRow = {
  prompt_key: string;
  channel: string;
  shown_at: string;
  answered_at: string | null;
  dismissed_at: string | null;
};

async function loadFirstPaidAt(profileId: string): Promise<DateTime | null> {
  const { data } = await createSupabaseAdminClient()
    .from("subscription_payments")
    .select("created_at")
    .eq("profile_id", profileId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.created_at ? DateTime.fromISO(String(data.created_at)) : null;
}

async function candidatePrompt(
  profile: Profile,
  rows: PromptRow[],
): Promise<FeedbackPrompt | null> {
  // Про оплату спрашиваем того, кто платит: тариф студии ведёт администратор.
  if (profile.accountRole === "staff") return null;

  const access = resolveSubscription(profile);
  const now = DateTime.now();

  if (access.isTrial && access.activeUntil) {
    const endsAt = DateTime.fromISO(access.activeUntil);

    return endsAt.diff(now, "days").days <= trialEndingLeadDays
      ? { key: "trial_ending", kind: "trial_ending" }
      : null;
  }

  // Пробный период кончился, а оплаты так и не было. Основной канал здесь
  // Telegram (src/app/api/jobs/feedback), кабинет — только для тех, у кого
  // бот не подключён.
  if (!access.isActive && !access.pausedUntil && !isPlanId(profile.subscriptionTier)) {
    const trialEnd = trialEndsAt(profile.joinedAt);

    if (
      !profile.telegramChatId &&
      trialEnd &&
      now.diff(DateTime.fromISO(trialEnd), "days").days <= 30
    ) {
      return { key: "trial_ended", kind: "trial_ended" };
    }

    return null;
  }

  if (access.isActive && access.planId) {
    const firstPaidAt = await loadFirstPaidAt(profile.id);

    if (!firstPaidAt || now.diff(firstPaidAt, "days").days < pulseFirstAfterPaidDays) {
      return null;
    }

    const pulseCount = rows.filter((row) => row.prompt_key.startsWith("pulse:")).length;
    const pending = rows.find(
      (row) => row.prompt_key.startsWith("pulse:") && !row.answered_at && !row.dismissed_at,
    );

    return {
      key: pending?.prompt_key ?? `pulse:${pulseCount + 1}`,
      kind: "pulse",
    };
  }

  return null;
}

// Какой опрос показать мастеру в кабинете. Не больше одного за раз и не чаще
// раза в promptCooldownDays: незакрытый опрос показывается снова, новый — только
// когда с прошлого прошло достаточно времени.
export async function pickFeedbackPrompt(profile: Profile): Promise<FeedbackPrompt | null> {
  if (!isSupabaseConfigured || !canManageWorkspace(profile.accountRole)) {
    return null;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("feedback_prompts")
      .select("prompt_key, channel, shown_at, answered_at, dismissed_at")
      .eq("profile_id", profile.id)
      .order("shown_at", { ascending: false });
    const rows = (data ?? []) as PromptRow[];
    const candidate = await candidatePrompt(profile, rows);

    if (!candidate) {
      return null;
    }

    const existing = rows.find((row) => row.prompt_key === candidate.key);

    if (existing) {
      // Этот же вопрос уже задан в Telegram — второй раз в кабинете не нужен.
      return !existing.answered_at && !existing.dismissed_at && existing.channel === "site"
        ? candidate
        : null;
    }

    // Конец пробного периода — повод сильнее паузы между опросами: его не
    // переспросишь через полтора месяца.
    const cooldownApplies = candidate.kind === "pulse";
    const lastShownAt = rows[0]?.shown_at ? DateTime.fromISO(rows[0].shown_at) : null;

    if (
      cooldownApplies &&
      lastShownAt &&
      DateTime.now().diff(lastShownAt, "days").days < promptCooldownDays
    ) {
      return null;
    }

    const { error } = await supabase.from("feedback_prompts").upsert(
      { profile_id: profile.id, prompt_key: candidate.key, channel: "site" },
      { onConflict: "profile_id,prompt_key", ignoreDuplicates: true },
    );

    if (error) {
      logWarn("Feedback: prompt log failed", { error });
      return null;
    }

    return candidate;
  } catch (error) {
    // Опрос — не повод ронять кабинет.
    logError("Feedback: prompt pick failed", { error });
    return null;
  }
}

export async function dismissFeedbackPrompt(input: { profileId: string; key: string }) {
  await createSupabaseAdminClient()
    .from("feedback_prompts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("profile_id", input.profileId)
    .eq("prompt_key", input.key)
    .is("answered_at", null);
}

// ---- Опрос в Telegram после пробного периода ----

export function trialEndedSurveyText() {
  return [
    "<b>Пробный период в okno закончился</b>",
    "",
    "Ты не продолжил — и нам правда важно понять почему. Выбери вариант, это одно нажатие.",
  ].join("\n");
}

export function trialEndedSurveyKeyboard() {
  return [
    [
      { text: "Дорого", callback_data: "fb:trial_ended:expensive" },
      { text: "Не успел разобраться", callback_data: "fb:trial_ended:no_time" },
    ],
    [
      { text: "Не хватает функции", callback_data: "fb:trial_ended:missing_feature" },
      { text: "Клиенты не записываются", callback_data: "fb:trial_ended:no_clients" },
    ],
    [
      { text: "Пользуюсь другим сервисом", callback_data: "fb:trial_ended:competitor" },
      { text: "Другое", callback_data: "fb:trial_ended:other" },
    ],
    [{ text: "Хочу продолжить", callback_data: "fb:trial_ended:ready" }],
  ];
}

// Раз в прогон: мастерам, у которых пробный период закончился от суток до
// недели назад без оплаты, — один вопрос в бот. Позже спрашивать бессмысленно:
// человек уже не вспомнит, почему ушёл.
export async function sendTrialEndedSurveys(): Promise<{ sent: number }> {
  if (!isSupabaseConfigured || !isTelegramConfigured) {
    return { sent: 0 };
  }

  const supabase = createSupabaseAdminClient();
  const now = DateTime.now();
  const joinedAfter = now.minus({ days: trialDays + 7 }).toUTC().toISO();
  const joinedBefore = now.minus({ days: trialDays + 1 }).toUTC().toISO();

  const { data, error } = await supabase
    .from("profiles")
    .select(`${profileColumns}, account_role`)
    .gte("created_at", joinedAfter)
    .lte("created_at", joinedBefore)
    .not("telegram_chat_id", "is", null)
    .eq("account_role", "admin")
    .limit(100);

  if (error) {
    logError("Feedback: trial-ended lookup failed", { error });
    return { sent: 0 };
  }

  let sent = 0;

  for (const row of (data ?? []) as ProfileRow[]) {
    // Оплатил хоть раз — это уже не «не продолжил после пробного».
    if (isPlanId(String(row.subscription_tier ?? "")) || row.subscription_tier === "pro") {
      continue;
    }

    // Журнал — единственная защита от повтора: строка появляется до отправки,
    // и упавшая отправка не повторится. Лучше не спросить, чем спросить дважды.
    const { data: inserted } = await supabase
      .from("feedback_prompts")
      .upsert(
        { profile_id: row.id, prompt_key: "trial_ended", channel: "telegram" },
        { onConflict: "profile_id,prompt_key", ignoreDuplicates: true },
      )
      .select("id");

    if (!inserted || inserted.length === 0) {
      continue;
    }

    const result = await sendMasterTelegram(
      row.telegram_chat_id,
      trialEndedSurveyText(),
      trialEndedSurveyKeyboard(),
    );

    if (result.ok) {
      sent += 1;
    }
  }

  return { sent };
}

// ---- Ответ автору ----

export async function deliverFeedbackReply(input: {
  feedbackId: string;
  reply: string;
  status: FeedbackStatus;
}): Promise<"telegram" | "site" | null> {
  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from("master_feedback")
    .select("id, kind, message, profile_id")
    .eq("id", input.feedbackId)
    .maybeSingle();

  if (!row) {
    return null;
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", row.profile_id)
    .maybeSingle();

  const original = String(row.message ?? "").trim();
  const quote = original.length > 200 ? `${original.slice(0, 200)}…` : original;
  const heading =
    input.status === "done"
      ? "<b>Сделали то, о чём ты просил</b>"
      : `<b>Ответ на твоё сообщение</b> · ${escapeTelegramHtml(feedbackStatusLabels[input.status])}`;
  const text = [
    heading,
    ...(quote ? ["", `<i>«${escapeTelegramHtml(quote)}»</i>`] : []),
    "",
    escapeTelegramHtml(input.reply),
  ].join("\n");

  const telegram = await sendMasterTelegram(
    profileRow?.telegram_chat_id ? String(profileRow.telegram_chat_id) : null,
    text,
  );
  const channel = telegram.ok ? "telegram" : "site";
  const nowIso = new Date().toISOString();

  await supabase
    .from("master_feedback")
    .update({
      reply_channel: channel,
      reply_sent_at: nowIso,
      // В Telegram ответ уже прочитан глазами — колокольчику напоминать нечего.
      reply_seen_at: channel === "telegram" ? nowIso : null,
    })
    .eq("id", input.feedbackId);

  return channel;
}

// ---- Кабинет: свои обращения ----

export type OwnFeedbackItem = {
  id: string;
  kind: FeedbackKind;
  reason: string | null;
  message: string;
  status: FeedbackStatus;
  adminReply: string | null;
  replySentAt: string | null;
  replySeen: boolean;
  createdAt: string;
};

export async function listOwnFeedback(profileId: string): Promise<OwnFeedbackItem[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const { data, error } = await createSupabaseAdminClient()
    .from("master_feedback")
    .select("id, kind, reason, message, status, admin_reply, reply_sent_at, reply_seen_at, created_at")
    .eq("profile_id", profileId)
    .in("kind", ["idea", "bug"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    logError("Feedback: own list failed", { error });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    kind: row.kind as FeedbackKind,
    reason: (row.reason as string | null) ?? null,
    message: String(row.message ?? ""),
    status: row.status as FeedbackStatus,
    adminReply: row.reply_sent_at ? ((row.admin_reply as string | null) ?? null) : null,
    replySentAt: (row.reply_sent_at as string | null) ?? null,
    replySeen: Boolean(row.reply_seen_at),
    createdAt: String(row.created_at),
  }));
}

export async function markOwnRepliesSeen(profileId: string) {
  await createSupabaseAdminClient()
    .from("master_feedback")
    .update({ reply_seen_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .not("reply_sent_at", "is", null)
    .is("reply_seen_at", null);
}

export async function countUnseenReplies(profileId: string): Promise<number> {
  if (!isSupabaseConfigured) {
    return 0;
  }

  const { count } = await createSupabaseAdminClient()
    .from("master_feedback")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .not("reply_sent_at", "is", null)
    .is("reply_seen_at", null);

  return count ?? 0;
}

export { loadProfileSummary };

// ---- Опрос в Telegram после окончания оплаченного периода ----

function expiredSurveyKeyboard() {
  return [
    [
      { text: "Забыл продлить", callback_data: "fb:cancel:forgot" },
      { text: "Дорого", callback_data: "fb:cancel:expensive" },
    ],
    [
      { text: "Мало клиентов / сезон", callback_data: "fb:cancel:seasonal" },
      { text: "Не хватает функции", callback_data: "fb:cancel:missing_feature" },
    ],
    [
      { text: "Другой сервис", callback_data: "fb:cancel:competitor" },
      { text: "Что-то не работало", callback_data: "fb:cancel:broken" },
    ],
    [{ text: "Другое", callback_data: "fb:cancel:other" }],
  ];
}

// Тихий отток: оплаченный период кончился от суток до недели назад, а
// продления нет. Спрашиваем один раз на каждый истёкший период — ключ
// журнала содержит дату конца.
export async function sendExpiredSubscriptionSurveys(): Promise<{ sent: number }> {
  if (!isSupabaseConfigured || !isTelegramConfigured) {
    return { sent: 0 };
  }

  const supabase = createSupabaseAdminClient();
  const now = DateTime.now();

  const { data, error } = await supabase
    .from("profiles")
    .select(profileColumns)
    .gte("subscription_until", now.minus({ days: 7 }).toUTC().toISO())
    .lte("subscription_until", now.minus({ days: 1 }).toUTC().toISO())
    .not("telegram_chat_id", "is", null)
    .eq("account_role", "admin")
    // Пока автопродление включено, job продления ещё пытается списать —
    // спрашивать «почему не продлил» рано.
    .eq("autopay_enabled", false)
    .limit(100);

  if (error) {
    logError("Feedback: expired lookup failed", { error });
    return { sent: 0 };
  }

  let sent = 0;

  for (const row of (data ?? []) as ProfileRow[]) {
    if (!row.subscription_until) {
      continue;
    }

    const key = `expired:${DateTime.fromISO(row.subscription_until).toFormat("yyyy-MM-dd")}`;
    const { data: inserted } = await supabase
      .from("feedback_prompts")
      .upsert(
        { profile_id: row.id, prompt_key: key, channel: "telegram" },
        { onConflict: "profile_id,prompt_key", ignoreDuplicates: true },
      )
      .select("id");

    if (!inserted || inserted.length === 0) {
      continue;
    }

    const result = await sendMasterTelegram(
      row.telegram_chat_id,
      [
        "<b>Подписка okno закончилась</b>",
        "",
        "Онлайн-запись у клиентов сейчас закрыта. Если решил не продлевать — подскажи почему, это одно нажатие.",
      ].join("\n"),
      expiredSurveyKeyboard(),
    );

    if (result.ok) {
      sent += 1;
    }
  }

  return { sent };
}

// Нажатие причины в опросе бота. Возвращает, был ли это первый ответ: на
// повторное нажатие отвечаем так же вежливо, но второй отзыв не создаём.
export async function answerTelegramSurvey(input: {
  profileId: string;
  kind: "trial_ended" | "cancel";
  reason: string;
}): Promise<"recorded" | "duplicate" | "failed"> {
  const supabase = createSupabaseAdminClient();
  const { data: prompts } = await supabase
    .from("feedback_prompts")
    .select("prompt_key, answered_at")
    .eq("profile_id", input.profileId)
    .eq("channel", "telegram")
    .order("shown_at", { ascending: false });

  const prompt = (prompts ?? []).find((row) =>
    input.kind === "trial_ended"
      ? row.prompt_key === "trial_ended"
      : String(row.prompt_key).startsWith("expired:"),
  );

  if (prompt?.answered_at) {
    return "duplicate";
  }

  const profile = await loadProfileSummary(input.profileId);

  if (!profile) {
    return "failed";
  }

  const saved = await recordFeedback({
    profile,
    kind: input.kind,
    channel: "telegram",
    reason: input.reason,
    promptKey: prompt ? String(prompt.prompt_key) : null,
    awaitText: input.reason !== "ready" && input.reason !== "forgot",
    context: prompt ? { prompt: String(prompt.prompt_key) } : {},
  });

  return saved ? "recorded" : "failed";
}
