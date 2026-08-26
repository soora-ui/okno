import { z } from "zod";

// Проверка ответа консультанта. Смысл тот же, что и в поддержке сервиса:
// обещание «бот отвечает строго по мануалу» стоит ровно столько, сколько
// стоит способ это проверить, а инструкция в промпте не проверяется никак.
//
// В поддержке проверялись названия тем — источников там десятки. Здесь
// источник один, и сверять нечего, кроме самого текста: модель обязана
// привести дословный фрагмент мануала, а код ищет его в мануале.
//
// Чего эта проверка НЕ доказывает — и это стоит понимать честно. Цитата
// подтверждает, что бот читал мануал, а не что ответ из неё следует: модель
// может процитировать про покраснение, а в reply дописать про мазь, которой
// в тексте нет. Зато она полностью ловит самый частый и самый опасный класс —
// ответ, целиком собранный из общих знаний о косметологии, где мануал не
// открывали вовсе.

export const consultantOutcomes = [
  "answer",
  "repeat_visit",
  "not_in_manual",
  "urgent",
  "off_topic",
] as const;

export type ConsultantOutcome = (typeof consultantOutcomes)[number];

export const consultantAnswerSchema = z.object({
  reply: z.string().trim().min(1),
  outcome: z.enum(consultantOutcomes),
  quote: z.string().trim().optional(),
});

export type ConsultantAnswer = z.infer<typeof consultantAnswerSchema>;

// Короткая цитата не доказывает ничего: «нельзя» или «через 2 дня» найдётся
// почти в любом мануале. Планка отсекает совпадения по случайности.
const MIN_QUOTE_LENGTH = 20;

// Нормализация под сверку. Регистр, «ё» и разнобой пробелов — не повод
// забраковать честную цитату. Варианты тире и кавычек приведены к одному:
// модель охотно переписывает «—» как «-», и это перенабор, а не выдумка.
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[—–−]/g, "-")
    .replace(/[«»""'']/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function isQuoteGrounded(
  quote: string | undefined,
  manual: string,
): boolean {
  const normalizedQuote = normalizeForMatch(quote ?? "");

  if (normalizedQuote.length < MIN_QUOTE_LENGTH) {
    return false;
  }

  return normalizeForMatch(manual).includes(normalizedQuote);
}

// Тексты тупиков пишем сами, а не отдаём модели: именно в этих исходах она
// сильнее всего тянется дописать «но обычно это проходит за пару дней».
export function buildFallbackReply(contact: string | null): string {
  return contact
    ? `Мастер об этом не писал — лучше спросить у него напрямую: ${contact}`
    : "Мастер об этом не писал — лучше спросить у него напрямую.";
}

export type ConsultantVerdict = {
  reply: string;
  /** Показывать ли клиенту напоминание, что это не медицинская рекомендация. */
  showMedicalDisclaimer: boolean;
  /** Считать ли предложение записаться повторно. Решает роут. */
  wantsRepeatVisit: boolean;
  /**
   * Держится ли reply на живой цитате из мануала. Нужно роуту в одном случае:
   * повторный визит распознан, а времени предложить нечего — тогда решается,
   * годится ли текст модели сам по себе.
   */
  isGrounded: boolean;
};

export function resolveConsultantAnswer(
  answer: ConsultantAnswer,
  context: { manual: string; masterContact: string | null },
): ConsultantVerdict {
  // urgent идёт первым и не проверяется на цитату: этот исход как раз про то,
  // что мануал тут не главный. Требовать опору на текст значило бы заставить
  // бота молчать ровно тогда, когда молчать нельзя.
  if (answer.outcome === "urgent") {
    return {
      reply: answer.reply,
      showMedicalDisclaimer: true,
      wantsRepeatVisit: false,
      isGrounded: false,
    };
  }

  // Конкретную дату и время считает код, но сам ответ про частоту повторов
  // модель берёт из мануала — и он проверяется цитатой на общих основаниях.
  // Без этого вопрос «когда можно повторить» на публичной странице, где
  // записи нет и кнопок времени не будет, упирался в «спроси у мастера» —
  // хотя в мануале ответ написан.
  if (answer.outcome === "repeat_visit") {
    return {
      reply: answer.reply,
      showMedicalDisclaimer: false,
      wantsRepeatVisit: true,
      isGrounded: isQuoteGrounded(answer.quote, context.manual),
    };
  }

  if (answer.outcome === "answer") {
    if (!isQuoteGrounded(answer.quote, context.manual)) {
      // Модель считает, что ответила по существу, а опоры под ответом нет.
      // Ровно тот случай, ради которого всё затевалось: показать такой текст
      // клиенту — то же самое, что дать ему совет от лица мастера, которого
      // мастер не давал.
      return {
        reply: buildFallbackReply(context.masterContact),
        showMedicalDisclaimer: false,
        wantsRepeatVisit: false,
        isGrounded: false,
      };
    }

    return {
      reply: answer.reply,
      showMedicalDisclaimer: true,
      wantsRepeatVisit: false,
      isGrounded: true,
    };
  }

  if (answer.outcome === "not_in_manual") {
    return {
      reply: buildFallbackReply(context.masterContact),
      showMedicalDisclaimer: false,
      wantsRepeatVisit: false,
      isGrounded: false,
    };
  }

  return {
    reply: answer.reply,
    showMedicalDisclaimer: false,
    wantsRepeatVisit: false,
    isGrounded: false,
  };
}
