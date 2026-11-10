import { isSupportMessageSignatureValid } from "@/lib/support-assistant/history-signature";

// История чата поддержки, присланная виджетом: что из неё можно показать
// модели и в каком объёме.

export type SupportChatHistoryEntry = {
  role: "user" | "assistant";
  content: string;
  fromOperator?: boolean;
  sig?: string;
};

type SupportChatHistory = SupportChatHistoryEntry[];

// Суммарный объём истории, который уходит модели. Сообщение и каждая реплика
// ограничены по отдельности, но 12 реплик по 2000 символов — это ~26 тысяч
// символов на один запрос, и анонимно. Настоящему разговору с поддержкой
// хватает последних нескольких реплик, поэтому старые просто отбрасываем, а не
// отказываем: виджет шлёт хвост переписки целиком и не должен ломаться.
export const supportMaxHistoryChars = 6000;

// Реплики ассистента принимаем только с подписью сервера: историю присылает
// браузер, и без проверки в неё можно вписать «бота» или «специалиста»,
// который уже пообещал бесплатный тариф или возврат.
export function keepAuthenticHistory(history: SupportChatHistory): SupportChatHistory {
  return history.filter(
    (entry) =>
      entry.role === "user" ||
      isSupportMessageSignatureValid(
        entry.fromOperator ? "operator" : "bot",
        entry.content,
        entry.sig,
      ),
  );
}

export function trimHistory(history: SupportChatHistory): SupportChatHistory {
  const kept: SupportChatHistory = [];
  let total = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    total += history[index].content.length;
    if (total > supportMaxHistoryChars) {
      break;
    }
    kept.unshift(history[index]);
  }

  // Модель ждёт, что разговор начинается с реплики пользователя.
  while (kept[0]?.role === "assistant") {
    kept.shift();
  }

  return kept;
}

// Последние реплики разговора для поиска по базе знаний: без них уточняющий
// вопрос («а сколько живёт эта ссылка?») не находит тему. Реплики живого
// специалиста не берём — они про конкретный аккаунт.
export function buildRetrievalContext(history: SupportChatHistory): string {
  const lastUser = history.findLast((entry) => entry.role === "user");
  const lastBot = history.findLast(
    (entry) => entry.role === "assistant" && !entry.fromOperator,
  );

  return [lastUser?.content, lastBot?.content].filter(Boolean).join("\n");
}
