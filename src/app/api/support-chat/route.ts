import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env, isSupportAssistantConfigured } from "@/lib/env";
import {
  buildSupportSystemPrompt,
  supportAnswerTool,
  supportAnswerToolName,
  supportAssistantMaxHistoryMessages,
  supportAssistantMaxUserMessageLength,
} from "@/lib/support-assistant/prompt";

// Роут AI-поддержки сервиса okno.business (чат-бот для владельцев
// аккаунтов/мастеров — вопросы по использованию сервиса). ОТДЕЛЬНАЯ фича от
// AI-консультанта, который отвечает клиентам мастера по услугам — у него
// другая база знаний и другой промпт, здесь не переиспользуется.

const supportChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(supportAssistantMaxUserMessageLength),
});

// Ответ модели приходит аргументами инструмента, поэтому валидируем его так
// же строго, как пользовательский ввод: пустой reply или мусор в suggestions
// не должны утечь в виджет.
const supportAnswerSchema = z.object({
  reply: z.string().trim().min(1),
  suggestions: z.array(z.string().trim().min(1).max(80)).max(4).optional(),
});

const supportChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(supportAssistantMaxUserMessageLength),
  history: z.array(supportChatMessageSchema).max(supportAssistantMaxHistoryMessages).optional().default([]),
});

// Простой in-memory рейт-лимитер на IP, по аналогии с публичной формой
// записи (см. src/app/actions/public-bookings.ts) — без отдельной таблицы в
// БД для MVP-этапа этой фичи.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const attemptsByIp = new Map<string, number[]>();

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

function checkRateLimit(request: Request): boolean {
  const now = Date.now();
  const ip = getClientIp(request);
  const recent = (attemptsByIp.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    attemptsByIp.set(ip, recent);
    return false;
  }

  recent.push(now);
  attemptsByIp.set(ip, recent);

  if (attemptsByIp.size > 5000) {
    for (const [key, timestamps] of attemptsByIp) {
      if (timestamps.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
        attemptsByIp.delete(key);
      }
    }
  }

  return true;
}

const GENERIC_ERROR_MESSAGE =
  "Не получилось получить ответ от поддержки. Попробуй ещё раз чуть позже.";

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  return anthropicClient;
}

export async function POST(request: Request) {
  if (!isSupportAssistantConfigured) {
    return NextResponse.json(
      { error: "AI-поддержка временно недоступна." },
      { status: 503 },
    );
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Слишком много сообщений подряд. Подожди немного и попробуй снова." },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const parsed = supportChatRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Проверь сообщение — оно пустое или слишком длинное." },
      { status: 400 },
    );
  }

  const { message, history } = parsed.data;

  try {
    const systemPrompt = await buildSupportSystemPrompt(message);
    const client = getAnthropicClient();

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      // Ответы поддержки короткие по регламенту (1–3 предложения либо до 5
      // шагов), запас нужен только на длинную инструкцию.
      max_tokens: 600,
      system: systemPrompt,
      tools: [supportAnswerTool],
      // Ответ обязан прийти структурой: свободный текст сломал бы кнопки
      // уточняющих вариантов в виджете.
      tool_choice: { type: "tool", name: supportAnswerToolName },
      messages: [
        ...history.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        { role: "user" as const, content: message },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "Не получилось ответить на этот вопрос. Попробуй переформулировать." },
        { status: 200 },
      );
    }

    const toolBlock = response.content.find(
      (block) => block.type === "tool_use" && block.name === supportAnswerToolName,
    );

    const answer =
      toolBlock && toolBlock.type === "tool_use"
        ? supportAnswerSchema.safeParse(toolBlock.input)
        : null;

    if (!answer?.success) {
      return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
    }

    return NextResponse.json({
      reply: answer.data.reply,
      suggestions: answer.data.suggestions ?? [],
    });
  } catch (error) {
    // Не логируем и не пробрасываем пользователю тело ошибки API (может
    // содержать фрагменты system prompt или служебные детали) — только
    // технический факт в серверный лог.
    console.error("okno: support chat request failed", error);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }
}
