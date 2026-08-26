import { z } from "zod";
import { getSupportTopicByTitle } from "@/lib/support-assistant/sitemap";

// Разбор и проверка ответа модели поддержки.
//
// Обещание «бот ходит только по базе знаний» стоит ровно столько, сколько
// стоит способ это проверить. Инструкция в промпте не проверяется никак,
// поэтому ответ приходит структурой: модель обязана назвать исход и, если
// отвечает по существу, перечислить темы-источники их настоящими названиями.
// Дальше решает уже код: ответ без опоры на базу до пользователя не доходит,
// он уходит живому оператору.
//
// Модель может назвать источник, которого нет, — это тоже сигнал: значит
// ответ она собрала не из блока знаний, а из общих представлений.

export const supportAnswerOutcomes = [
  "answer",
  "no_such_feature",
  "needs_human",
  "clarify",
  "off_topic",
  "reply_to_operator",
] as const;

export const supportAnswerSchema = z.object({
  // Пустой текст допустим только у reply_to_operator: там ответ пользователю
  // не показывается, его реплика просто уезжает специалисту. Для остальных
  // исходов пустоту ловит resolveSupportAnswer.
  reply: z.string().trim(),
  outcome: z.enum(supportAnswerOutcomes),
  sources: z.array(z.string().trim().min(1)).max(6).optional(),
  summary: z.string().trim().max(500).optional(),
  suggestions: z.array(z.string().trim().min(1).max(80)).max(4).optional(),
});

export type SupportAnswer = z.infer<typeof supportAnswerSchema>;

const UNGROUNDED_GUEST_REPLY =
  "Точного ответа на это у меня нет. Заведи аккаунт на okno.business/register — из кабинета вопрос уходит специалисту, и он ответит лично.";

export type SupportVerdict =
  | { kind: "reply"; reply: string; suggestions: string[] }
  | { kind: "escalate"; summary: string }
  // Реплика пользователя адресована живому специалисту, а не боту: её нужно
  // переслать в открытое обращение, а не отвечать самим.
  | { kind: "forward"; text: string }
  // Модель вернула пустой ответ там, где он обязателен. Показывать пустой
  // пузырь нельзя, выдумывать за модель — тем более.
  | { kind: "failed" };

export function resolveSupportAnswer(
  answer: SupportAnswer,
  context: { isAuthenticated: boolean; question: string },
): SupportVerdict {
  // Разговор со специалистом продолжается: бот в него не вмешивается.
  if (answer.outcome === "reply_to_operator") {
    return { kind: "forward", text: context.question };
  }

  if (!answer.reply) {
    return { kind: "failed" };
  }

  const groundedSources = (answer.sources ?? []).filter((title) =>
    Boolean(getSupportTopicByTitle(title)),
  );

  // Ответ по существу без единого живого источника — это ответ из общих
  // знаний модели, а не из базы. Ровно тот случай, ради которого всё
  // затевалось: лучше позвать человека, чем выдать уверенную выдумку.
  const isUngrounded = answer.outcome === "answer" && groundedSources.length === 0;
  const needsHuman = answer.outcome === "needs_human" || isUngrounded;

  if (needsHuman && context.isAuthenticated) {
    return {
      kind: "escalate",
      summary: answer.summary?.trim() || context.question,
    };
  }

  // Аноним, а ответ не опирается на базу. Передать вопрос человеку некому, но
  // и текст модели показывать нельзя: она сама считает его ответом по
  // существу, а опоры под ним нет. Отдаём свою формулировку.
  if (isUngrounded) {
    return { kind: "reply", reply: UNGROUNDED_GUEST_REPLY, suggestions: [] };
  }

  return {
    kind: "reply",
    reply: answer.reply,
    // Варианты уточнения имеют смысл только когда модель действительно
    // не поняла вопрос. В остальных исходах это превращается в «может, вас
    // интересует что-то ещё?» — ровно то, что регламент запрещает.
    suggestions: answer.outcome === "clarify" ? (answer.suggestions ?? []) : [],
  };
}
