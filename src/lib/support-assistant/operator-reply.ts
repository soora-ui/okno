import Anthropic from "@anthropic-ai/sdk";
import { env, isSupportAssistantConfigured } from "@/lib/env";
import { logWarn } from "@/lib/observability/logger";

// Причёсывание ответа оператора под формат поддержки.
//
// Оператор отвечает с телефона: коротко, иногда обрывками, иногда с внутренней
// кухней вроде «щас гляну, у него платёж висит». Модель приводит это к тому же
// виду, в каком отвечает сама.
//
// Опасность у этой затеи ровно одна и она серьёзная. Эскалация случилась
// потому, что модель не знала ответа. Пустив её переписывать факт, которого
// она не понимает, легко получить инверсию: «не отключится, пока не кончится
// период» превращается в «отключится по окончании периода», и это уходит
// пользователю уверенным тоном поддержки.
//
// Поэтому переписанный текст сверяется с исходником. Появились цифры, пути по
// интерфейсу или названия кнопок в кавычках, которых у оператора не было —
// значит модель добавила от себя, и мы отправляем слова оператора дословно.
// Правило грубое и намеренно перестраховочное: цена ложного срабатывания —
// чуть менее гладкий текст, цена пропуска — враньё от лица поддержки.

const MODEL = env.supportAssistantModel;

const SYSTEM_PROMPT = [
  "Ты причёсываешь ответ оператора поддержки okno.business перед отправкой пользователю.",
  "",
  "Разрешено: убрать опечатки и обрывки, собрать связное предложение, убрать внутреннюю кухню (что оператор смотрел в базе, что уточнял у коллег, названия таблиц и систем).",
  "СТРОГО ЗАПРЕЩЕНО: добавлять факты, которых нет в тексте оператора. Не дописывай пути по интерфейсу, номера, суммы, сроки, названия кнопок и разделов. Не меняй смысл на противоположный. Не добавляй отрицание и не убирай его.",
  "Если оператор ответил одним словом — оставь одно слово. Короткий ответ лучше додуманного.",
  "Тон: на «ты», 1–3 предложения, без вступлений, без эмодзи, без предложений помочь с чем-то ещё.",
  "Верни только итоговый текст, без пояснений.",
].join("\n");

// Цифры, стрелка пути по интерфейсу и текст в «кавычках» — три вещи, которые
// модель дописывает чаще всего и которые пользователь примет за инструкцию.
const DIGITS = /\d+/g;
const UI_PATH = /→/;
const QUOTED = /[«"']([^«»"']{2,40})[»"']/g;

function collectDigits(text: string): string[] {
  return text.match(DIGITS) ?? [];
}

function collectQuoted(text: string): string[] {
  return [...text.matchAll(QUOTED)].map((match) => match[1].toLowerCase().trim());
}

/**
 * Не появилось ли в причёсанном тексте того, чего не было у оператора.
 * Сравнение по включению, а не по равенству: убрать лишнее модели можно,
 * добавить — нет.
 */
export function hasInventedDetails(original: string, rewritten: string): boolean {
  const originalDigits = new Set(collectDigits(original));
  if (collectDigits(rewritten).some((digit) => !originalDigits.has(digit))) {
    return true;
  }

  if (UI_PATH.test(rewritten) && !UI_PATH.test(original)) {
    return true;
  }

  const originalQuoted = collectQuoted(original);
  return collectQuoted(rewritten).some(
    (quote) => !originalQuoted.some((source) => source.includes(quote)),
  );
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  return client;
}

/**
 * Возвращает текст, который увидит пользователь. Любая заминка — недоступная
 * модель, отказ, добавленные детали — заканчивается ответом оператора как
 * есть: он хуже читается, но он верный.
 */
export async function polishOperatorReply(input: {
  question: string;
  operatorReply: string;
}): Promise<string> {
  const operatorReply = input.operatorReply.trim();

  if (!isSupportAssistantConfigured) {
    return operatorReply;
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Вопрос пользователя: ${input.question}`,
            "",
            `Ответ оператора: ${operatorReply}`,
          ].join("\n"),
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rewritten = textBlock && "text" in textBlock ? textBlock.text.trim() : "";

    if (!rewritten) {
      return operatorReply;
    }

    if (hasInventedDetails(operatorReply, rewritten)) {
      logWarn("Support: polished operator reply added details, falling back to verbatim");
      return operatorReply;
    }

    return rewritten;
  } catch {
    return operatorReply;
  }
}
