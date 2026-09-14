import Anthropic from "@anthropic-ai/sdk";
import { env, isSupportAssistantConfigured } from "@/lib/env";
import { formatDaysAgo } from "@/lib/client-return";
import { logWarn } from "@/lib/observability/logger";

// Черновик напоминания «давно не были».
//
// ИИ пишет от лица мастера по истории клиента: какую услугу делал, как давно,
// что мастер о нём записал. Черновик всегда проходит через глаза мастера —
// это его отношения с клиентом, и последнее слово за ним. Поэтому у модели
// одна задача: попасть в тон, а не решить, что предложить.

export type ClientReturnMessageContext = {
  master: { fullName: string; specialty: string };
  client: {
    name: string;
    daysSinceLastVisit: number | null;
    lastServiceTitle: string | null;
    preferredServices: string[];
    totalVisits: number;
    notes: string;
  };
};

// Текст уходит клиенту от имени мастера, и промах в тоне стоит дороже
// токенов: берём старшую модель. Сообщение короткое — расход в пределах
// копеек за черновик.
const MODEL = "claude-opus-5";
const maxMessageLength = 400;

const SYSTEM_PROMPT = `Ты пишешь короткое личное сообщение клиенту от имени мастера бьюти-сферы. Клиент давно не приходил, мастер хочет мягко напомнить о себе.

Правила:
- Пиши по-русски, 2–4 предложения, до ${maxMessageLength} символов. Только текст сообщения, без заголовков, кавычек, подписи и пояснений.
- Обращайся по имени. По умолчанию на «вы» со строчной буквы; на «ты» — только если из заметок мастера видно, что они на «ты».
- Опирайся только на факты из контекста: услуга, давность визита, заметки. Ничего не выдумывай: никаких скидок, акций, свободных окон, изменений цен, новых услуг.
- Не пиши точное число дней, если оно не указано. Не упоминай, что текст написан ИИ или сервисом.
- Не вставляй ссылки и телефоны — кнопка записи будет под сообщением.
- Не дави: без «вы нас забыли», без чувства вины, без восклицательных знаков подряд и без эмодзи.
- Тон — тёплый, спокойный, как пишет живой мастер постоянному клиенту. Заканчивай мягким приглашением выбрать удобное время.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  return client;
}

function describeContext(context: ClientReturnMessageContext) {
  const { master, client: person } = context;

  return [
    `Мастер: ${master.fullName}, ${master.specialty || "мастер"}.`,
    `Клиент: ${person.name}.`,
    person.daysSinceLastVisit !== null
      ? `Последний визит: ${formatDaysAgo(person.daysSinceLastVisit)} назад.`
      : "Дата последнего визита неизвестна.",
    person.lastServiceTitle ? `Последняя услуга: ${person.lastServiceTitle}.` : "",
    person.preferredServices.length > 0
      ? `Обычно выбирает: ${person.preferredServices.join(", ")}.`
      : "",
    `Всего визитов: ${person.totalVisits}.`,
    person.notes ? `Заметки мастера о клиенте: ${person.notes}` : "Заметок о клиенте нет.",
  ]
    .filter(Boolean)
    .join("\n");
}

// Шаблон на случай, когда модель недоступна: хуже по тону, но верный по
// фактам — мастер всё равно увидит текст до отправки.
export function buildFallbackReturnMessage(context: ClientReturnMessageContext) {
  const { master, client: person } = context;
  const service = person.lastServiceTitle ? ` после «${person.lastServiceTitle}»` : "";

  return `${person.name}, здравствуйте! Это ${master.fullName}. Давно не виделись${service} — если хочется обновить, выберите удобное время по кнопке ниже. Будет здорово увидеться.`;
}

export async function draftClientReturnMessage(
  context: ClientReturnMessageContext,
): Promise<{ text: string; source: "ai" | "fallback" }> {
  if (!isSupportAssistantConfigured) {
    return { text: buildFallbackReturnMessage(context), source: "fallback" };
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 600,
      // Задача — попасть в тон, а не рассуждать: минимальное усилие даёт
      // ответ за секунды, пока мастер ждёт в карточке.
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: describeContext(context) }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";

    if (!text || text.length > maxMessageLength * 1.5) {
      logWarn("Client return draft rejected, using fallback", { length: text.length });
      return { text: buildFallbackReturnMessage(context), source: "fallback" };
    }

    return { text, source: "ai" };
  } catch (error) {
    logWarn("Client return draft failed, using fallback", { error });
    return { text: buildFallbackReturnMessage(context), source: "fallback" };
  }
}
