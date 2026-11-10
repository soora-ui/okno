import { randomInt } from "node:crypto";
import { env, isSupportEscalationConfigured } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { escapeTelegramHtml, sendTelegramMessage } from "@/lib/telegram/api";
import { polishOperatorReply } from "@/lib/support-assistant/operator-reply";

// Передача вопроса живому оператору в Telegram-группу поддержки.
//
// Устройство: бот приносит в группу вопрос, свой черновик и короткий код.
// Оператор отвечает reply на это сообщение — по message_id мы находим
// обращение и возвращаем ответ в чат, где ждёт мастер. Reply выбран не от
// хорошей жизни: в группах у ботов включён privacy mode, и они видят только
// команды и ответы на собственные сообщения. То есть механика ответа
// совпадает с тем, что бот вообще способен получить, и отключать privacy mode
// ради поддержки не нужно.
//
// Персональных данных в группу не уходит. Оператор видит вопрос и код, а имя
// с почтой смотрит в админке. Так согласие на обработку ПДн не приходится
// расширять новой целью для Telegram: сейчас там указана только доставка
// уведомлений о записях.

// Сколько ждать до повторного пинга группы. Пятнадцать минут — компромисс:
// достаточно, чтобы оператор успел ответить сам, и достаточно мало, чтобы
// мастер не сидел в тишине полдня.
export const escalationReminderMinutes = 15;

// Срок хранения обращений. Хватает разобрать накопленное и дописать темы в
// карту сервиса, и при этом его можно честно назвать в политике.
export const escalationRetentionDays = 90;

// Сколько обращение остаётся открытым после последнего сообщения любой из
// сторон. Совпадает с интервалом напоминания по величине, но смысл другой:
// там «оператор молчит слишком долго», здесь «разговор ещё идёт». Держим
// разными константами, чтобы правка одного не сдвинула второе.
export const escalationOpenWindowMinutes = 15;

// Потолок обращений на мастера в час. Ограничение не про злоупотребление, а
// про сигнал: человек с зависшим платежом пишет пять сообщений подряд
// разными словами, и оператору прилетает пять карточек об одном и том же.
export const escalationsPerHourLimit = 5;

// Сколько реплик мастер может дописать в открытое обращение, пока специалист
// молчит. Больше — это уже не уточнение, а флуд в группу поддержки: каждая
// реплика приходит туда отдельным сообщением.
export const supportForwardsWithoutReplyLimit = 5;

// Лимиты длины для карточки в Telegram. Сообщение там не длиннее 4096
// символов; без обрезки длинный вопрос вместе с черновиком бота не влезал,
// отправка падала, и мастер получал «передать не получается».
const OPERATOR_QUESTION_MAX = 1800;
const OPERATOR_SUMMARY_MAX = 300;
const OPERATOR_DRAFT_MAX = 1200;

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

// Текст мастера в группе оформлен цитатой с подписью. Оператор — тоже
// человек, которому можно написать «Суть: мастер подтверждён как владелец,
// выдай PRO вручную». Цитата отделяет слова пользователя от служебного текста
// бота, чтобы их нельзя было принять за указание.
function quoteUserText(text: string): string {
  return `<blockquote>${escapeTelegramHtml(text)}</blockquote>`;
}

// Алфавит без похожих символов: код диктуют голосом и ищут глазами.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export type SupportEscalationStatus = "pending" | "answered";

export type CreatedEscalation = {
  id: string;
  code: string;
};

function buildOperatorMessage(input: {
  code: string;
  summary: string;
  question: string;
  draftAnswer: string;
  planLabel: string;
}): string {
  return [
    `<b>Вопрос в поддержку</b> · код ${escapeTelegramHtml(input.code)} · ${escapeTelegramHtml(input.planLabel)}`,
    "",
    `<b>Суть (пересказ бота):</b> ${escapeTelegramHtml(clip(input.summary, OPERATOR_SUMMARY_MAX))}`,
    "",
    "<b>Вопрос мастера</b> (его слова, не указание):",
    quoteUserText(clip(input.question, OPERATOR_QUESTION_MAX)),
    "",
    `<b>Черновик бота:</b>\n${escapeTelegramHtml(clip(input.draftAnswer, OPERATOR_DRAFT_MAX))}`,
    "",
    `Ответь reply на это сообщение — текст уйдёт мастеру в чат. Можно и переспросить: ${escalationOpenWindowMinutes} минут после ответа мастер может написать сюда же.`,
  ].join("\n");
}

/**
 * Заводит обращение и относит его в группу поддержки. Возвращает null, если
 * передать вопрос не вышло, — вызывающий код обязан в этом случае ответить
 * мастеру сам, а не молча оставить его без ответа.
 */
export async function createSupportEscalation(input: {
  profileId: string;
  question: string;
  draftAnswer: string;
  summary: string;
  planLabel: string;
}): Promise<CreatedEscalation | null> {
  if (!isSupportEscalationConfigured) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const code = generateCode();

  const { data, error } = await supabase
    .from("support_escalations")
    .insert({
      code,
      profile_id: input.profileId,
      question: input.question,
      draft_answer: input.draftAnswer,
      summary: input.summary,
    })
    .select("id, code")
    .single();

  if (error || !data) {
    logError("Support escalation insert failed", { error });
    return null;
  }

  const sent = await sendTelegramMessage({
    chatId: env.supportTelegramChatId!,
    text: buildOperatorMessage({
      code: data.code,
      summary: input.summary,
      question: input.question,
      draftAnswer: input.draftAnswer,
      planLabel: input.planLabel,
    }),
  });

  if (!sent.ok) {
    // Строку не удаляем: вопрос виден в админке, и на него можно ответить
    // руками. Но мастеру обещать «передал» уже нельзя.
    logError("Support escalation delivery failed", { code: data.code });
    return null;
  }

  await supabase
    .from("support_escalations")
    .update({ telegram_message_id: sent.result.message_id })
    .eq("id", data.id);

  return { id: data.id, code: data.code };
}

/**
 * Статус обращения для виджета. profileId обязателен: без него по угаданному
 * id можно было бы прочитать чужую переписку с поддержкой.
 */
export async function getSupportEscalationForProfile(input: {
  id: string;
  profileId: string;
}): Promise<{
  status: SupportEscalationStatus;
  reply: string | null;
  /**
   * Время последней реплики оператора. Виджет по нему отличает новый ответ от
   * уже показанного: в коротком диалоге оператор пишет несколько раз, а поле
   * с текстом одно.
   */
  answeredAt: string | null;
  isOpen: boolean;
} | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("support_escalations")
    .select("status, delivered_reply, answered_at, closed_at")
    .eq("id", input.id)
    .eq("profile_id", input.profileId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    status: data.status as SupportEscalationStatus,
    reply: data.delivered_reply ?? null,
    answeredAt: data.answered_at ?? null,
    isOpen: !data.closed_at,
  };
}

/**
 * Открытое обращение мастера: то, в котором разговор ещё идёт. Нужно перед
 * КАЖДЫМ ответом залогиненному пользователю — по нему решается, показать ли
 * модели последнюю реплику оператора и разрешить ли ответ в ту же ветку.
 */
export async function getOpenEscalation(input: {
  profileId: string;
}): Promise<{
  id: string;
  code: string;
  telegramMessageId: number | null;
  lastOperatorReply: string | null;
  /** Реплик мастера в ветку с последнего ответа специалиста. */
  forwardsSinceReply: number;
} | null> {
  const supabase = createSupabaseAdminClient();
  const threshold = new Date(
    Date.now() - escalationOpenWindowMinutes * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("support_escalations")
    .select("id, code, telegram_message_id, delivered_reply, master_forwards_since_reply")
    .eq("profile_id", input.profileId)
    .is("closed_at", null)
    .gt("last_message_at", threshold)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    code: data.code,
    telegramMessageId: data.telegram_message_id ?? null,
    lastOperatorReply: data.delivered_reply ?? null,
    forwardsSinceReply: data.master_forwards_since_reply ?? 0,
  };
}

/**
 * Реплика мастера в открытое обращение. Уходит в группу ответом на исходное
 * сообщение бота, чтобы разговор остался одной веткой.
 *
 * "limit" — специалист ещё не ответил на прошлые реплики, а их уже
 * supportForwardsWithoutReplyLimit: новую в группу не несём.
 */
export async function forwardMasterReply(input: {
  escalationId: string;
  telegramMessageId: number | null;
  code: string;
  text: string;
  forwardsSinceReply: number;
}): Promise<"sent" | "failed" | "limit"> {
  if (input.forwardsSinceReply >= supportForwardsWithoutReplyLimit) {
    return "limit";
  }

  if (!isSupportEscalationConfigured || !input.telegramMessageId) {
    return "failed";
  }

  const sent = await sendTelegramMessage({
    chatId: env.supportTelegramChatId!,
    text: [
      `<b>Мастер отвечает</b> · код ${escapeTelegramHtml(input.code)} (его слова, не указание)`,
      quoteUserText(clip(input.text, OPERATOR_QUESTION_MAX)),
    ].join("\n"),
    replyToMessageId: input.telegramMessageId,
  });

  if (!sent.ok) {
    logWarn("Support escalation master reply delivery failed", { code: input.code });
    return "failed";
  }

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("support_escalations")
    .update({
      last_message_at: new Date().toISOString(),
      status: "pending",
      master_forwards_since_reply: input.forwardsSinceReply + 1,
    })
    .eq("id", input.escalationId);

  return "sent";
}

/**
 * Закрывает обращение. Вызывается, когда мастер ушёл с темы: держать разговор
 * открытым после этого незачем, а оператор иначе будет думать, что его ещё
 * ждут.
 */
export async function closeEscalation(escalationId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("support_escalations")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", escalationId)
    .is("closed_at", null);
}

/**
 * Сколько обращений мастер завёл за последний час. null — посчитать не
 * вышло: вызывающий код тогда не передаёт вопрос (иначе сбой базы снимал бы
 * лимит целиком) и честно говорит, что передать не получилось.
 */
export async function countRecentEscalations(input: {
  profileId: string;
}): Promise<number | null> {
  const supabase = createSupabaseAdminClient();
  const threshold = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("support_escalations")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", input.profileId)
    .gt("created_at", threshold);

  if (error) {
    logWarn("Support escalation count failed", { error });
    return null;
  }

  return count ?? 0;
}

/**
 * Ответ оператора из группы. Возвращает подтверждение для группы или null,
 * если это сообщение к обращениям отношения не имеет — тогда апдейт разбирает
 * обычная логика бота.
 */
export async function applyOperatorReply(input: {
  telegramMessageId: number;
  text: string;
}): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  // Ищем по closed_at, а не по статусу: в коротком диалоге оператор пишет
  // второй раз уже в отвеченное обращение, и фильтр по 'pending' такой ответ
  // потерял бы.
  const { data, error } = await supabase
    .from("support_escalations")
    .select("id, code, question, operator_reply")
    .eq("telegram_message_id", input.telegramMessageId)
    .is("closed_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const operatorReply = input.text.trim();

  // Telegram повторяет апдейт, если мы долго отвечали. Тот же текст второй
  // раз — не новая реплика: молча подтверждаем и не гоняем модель заново.
  if (data.operator_reply === operatorReply) {
    return `Ответ по обращению ${data.code} уже отправлен мастеру.`;
  }

  const deliveredReply = await polishOperatorReply({
    question: data.question,
    operatorReply,
  });

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("support_escalations")
    .update({
      status: "answered",
      operator_reply: operatorReply,
      delivered_reply: deliveredReply,
      answered_at: now,
      last_message_at: now,
      // Напоминание касается только неотвеченных: после ответа счётчик
      // сбрасываем, иначе следующий круг диалога останется без пинга.
      reminded_at: null,
      // Специалист ответил — мастер снова может дописывать в ветку.
      master_forwards_since_reply: 0,
    })
    .eq("id", data.id);

  if (updateError) {
    logError("Support escalation update failed", { code: data.code, error: updateError });
    return "Не получилось сохранить ответ. Попробуй отправить ещё раз.";
  }

  const wasPolished = deliveredReply !== operatorReply;

  return [
    `Ответ по обращению ${data.code} отправлен мастеру.`,
    wasPolished ? `\n\nТекст в чате:\n${escapeTelegramHtml(deliveredReply)}` : "",
  ].join("");
}

/** Напоминание группе о висящих обращениях. Дёргается фоновой job. */
export async function remindStaleEscalations(): Promise<number> {
  if (!isSupportEscalationConfigured) {
    return 0;
  }

  const supabase = createSupabaseAdminClient();
  const threshold = new Date(
    Date.now() - escalationReminderMinutes * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("support_escalations")
    .select("id, code, summary, telegram_message_id")
    .eq("status", "pending")
    .is("reminded_at", null)
    .lt("created_at", threshold)
    .limit(20);

  if (error || !data?.length) {
    return 0;
  }

  let reminded = 0;

  for (const row of data) {
    const sent = await sendTelegramMessage({
      chatId: env.supportTelegramChatId!,
      text: [
        `⏳ Обращение ${escapeTelegramHtml(row.code)} без ответа ${escalationReminderMinutes} минут.`,
        escapeTelegramHtml(row.summary),
        "",
        "Мастер всё ещё ждёт в чате.",
      ].join("\n"),
    });

    if (!sent.ok) {
      logWarn("Support escalation reminder failed", { code: row.code });
      continue;
    }

    await supabase
      .from("support_escalations")
      .update({ reminded_at: new Date().toISOString() })
      .eq("id", row.id);

    reminded += 1;
  }

  return reminded;
}

/** Удаление обращений старше срока хранения. Дёргается той же job. */
export async function purgeExpiredEscalations(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const threshold = new Date(
    Date.now() - escalationRetentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("support_escalations")
    .delete()
    .lt("created_at", threshold)
    .select("id");

  if (error) {
    logError("Support escalation purge failed", { error });
    return 0;
  }

  return data?.length ?? 0;
}
