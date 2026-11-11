import type { SupportChatHistoryEntry } from "@/lib/support-assistant/history";

// Приветствие в ответах поддержки ставит код, а не модель.
//
// Раньше это было правилом в промпте, и модель его соблюдала через раз: на
// «Привет! Где взять ссылку…» не здоровалась в ответ, на первое сообщение
// дня с уточняющим вопросом — тоже. Правило детерминированное («первое
// сообщение за день или пользователь поздоровался, и бот сегодня ещё не
// здоровался»), поэтому и исполнять его должен код. Заодно флаг «первое за
// день» ушёл из системного промпта и больше не ломает кэш.

const GREETING = "Привет!";

// Флаг u и \p{L}: без них \w и \b в JavaScript видят только латиницу, и
// «Привет!» не распознавался как приветствие.
const USER_GREETING =
  /^\s*(привет\p{L}*|здравствуй\p{L}*|здрасьте|добр(ый|ое|ого)\s+(день|утро|вечер|утра|дня|вечера)|доброй\s+ночи|хай|салют|hello|hi|hey)(?![\p{L}\p{N}])/iu;

// То, чем модель всё-таки может начать ответ вопреки промпту: срезаем, чтобы
// не получилось «Привет! Здравствуй! …».
const MODEL_GREETING =
  /^\s*(привет|здравствуй(те)?|добрый\s+(день|вечер)|доброе\s+утро)(?![\p{L}\p{N}])[!.,\s]*/iu;

export function userGreeted(message: string): boolean {
  return USER_GREETING.test(message);
}

export function applySupportGreeting(
  reply: string,
  input: {
    isFirstMessageToday: boolean;
    message: string;
    history: SupportChatHistoryEntry[];
  },
): string {
  const body = reply.replace(MODEL_GREETING, "");
  const cleaned = body ? body.charAt(0).toUpperCase() + body.slice(1) : body;

  const botAlreadyGreeted = input.history.some(
    (entry) =>
      entry.role === "assistant" &&
      !entry.fromOperator &&
      entry.content.startsWith(GREETING),
  );
  // Первое сообщение дня — здороваемся всегда: в истории может лежать
  // вчерашнее «Привет!», виджет хранит переписку сутки. Иначе — только в ответ
  // на приветствие и только если сегодня ещё не здоровались.
  const shouldGreet =
    input.isFirstMessageToday ||
    (userGreeted(input.message) && !botAlreadyGreeted);

  return shouldGreet ? `${GREETING} ${cleaned}` : cleaned;
}
