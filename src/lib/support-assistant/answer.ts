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

// Разбор мягкий там, где модель промахнулась в мелочи: пустая строка в
// sources, summary длиннее лимита, лишний вариант уточнения. Раньше любая
// такая мелочь роняла весь ответ в 502 — пользователь видел ошибку на вопрос,
// на который у бота был нормальный ответ. Чистим и обрезаем, а строгими
// оставляем только исход и тип текста: без них ответ не разобрать.
const trimmedStrings = (maxItems: number, maxLength?: number) =>
  z
    .array(z.unknown())
    .optional()
    .transform((items) =>
      (items ?? [])
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (maxLength ? item.slice(0, maxLength) : item))
        .slice(0, maxItems),
    );

export const supportAnswerSchema = z.object({
  // Пустой текст допустим у reply_to_operator (ответ не показывается) и у
  // needs_human (вместо него идёт своя формулировка). Для остальных исходов
  // пустоту ловит resolveSupportAnswer.
  reply: z.string().trim(),
  outcome: z.enum(supportAnswerOutcomes),
  sources: trimmedStrings(6),
  summary: z
    .string()
    .optional()
    .transform((value) => value?.trim().slice(0, 500) || undefined),
  suggestions: trimmedStrings(4, 80),
});

export type SupportAnswer = z.infer<typeof supportAnswerSchema>;

// Гостю на любой вопрос «для человека» — одна фиксированная фраза, а не текст
// модели. На red-team именно в этих ответах рождались обещания, которых
// сервис не давал: «специалист решит по компенсации», «сможет обработать
// возврат». Передать гостя человеку всё равно некому, поэтому и сочинять
// нечего. «Войди» — потому что у многих аккаунт уже есть, они просто не в нём.
const UNGROUNDED_GUEST_REPLY =
  "Точного ответа на это у меня нет. Войди в кабинет (okno.business/login) или заведи аккаунт (okno.business/register) — из кабинета вопрос уходит специалисту, и он ответит лично.";

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
  context: {
    isAuthenticated: boolean;
    question: string;
    /** Открыт ли сейчас разговор с живым специалистом. */
    hasOpenEscalation: boolean;
  },
): SupportVerdict {
  // Разговор со специалистом продолжается: бот в него не вмешивается.
  if (answer.outcome === "reply_to_operator" && context.hasOpenEscalation) {
    return { kind: "forward", text: context.question };
  }

  const groundedSources = (answer.sources ?? []).filter((title) =>
    Boolean(getSupportTopicByTitle(title)),
  );

  // Ответ по существу без единого живого источника — это ответ из общих
  // знаний модели, а не из базы. Ровно тот случай, ради которого всё
  // затевалось: лучше позвать человека, чем выдать уверенную выдумку.
  const isUngrounded = answer.outcome === "answer" && groundedSources.length === 0;
  // reply_to_operator без открытого разговора: исход лежит в схеме всегда,
  // и модель изредка выбирает его без ветки. Адресат у реплики тот же —
  // человек, поэтому это обычное обращение к специалисту.
  const needsHuman =
    answer.outcome === "needs_human" ||
    answer.outcome === "reply_to_operator" ||
    isUngrounded;

  if (needsHuman && context.isAuthenticated) {
    return {
      kind: "escalate",
      summary: answer.summary?.trim() || context.question,
    };
  }

  // Аноним, а вопрос — для человека (или ответ не опирается на базу).
  // Передать вопрос некому, а текст модели в этом месте — главный источник
  // выдуманных обещаний. Отдаём свою формулировку.
  if (needsHuman) {
    return { kind: "reply", reply: UNGROUNDED_GUEST_REPLY, suggestions: [] };
  }

  if (!answer.reply) {
    return { kind: "failed" };
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
