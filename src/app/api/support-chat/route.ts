import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env, isSupportAssistantConfigured } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import { getPlan } from "@/config/plans";
import { resolveSubscription } from "@/lib/subscription";
import {
  resolveSupportAnswer,
  supportAnswerSchema,
} from "@/lib/support-assistant/answer";
import {
  closeEscalation,
  countRecentEscalations,
  createSupportEscalation,
  escalationsPerHourLimit,
  forwardMasterReply,
  getOpenEscalation,
} from "@/lib/support-assistant/escalation";
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
  // Реплика живого специалиста, а не бота. В истории она выглядит как
  // сообщение ассистента, и без пометки модель приняла бы чужой ответ про
  // конкретный аккаунт за собственные слова — то есть за факт о сервисе.
  fromOperator: z.boolean().optional(),
});

const supportChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(supportAssistantMaxUserMessageLength),
  history: z.array(supportChatMessageSchema).max(supportAssistantMaxHistoryMessages).optional().default([]),
  // Первое ли это сообщение за сегодня — считает виджет по дате последнего
  // сообщения в своём хранилище. Отсюда, а не с сервера: виджет и так хранит
  // переписку у себя, работает для гостей без отдельного visitor id и знает
  // настоящую дату в часовом поясе пользователя. Подделать флаг можно, но
  // ценой ровно одного лишнего «Привет» — заводить ради этого запись в БД на
  // каждое сообщение нечего.
  isFirstMessageToday: z.boolean().optional().default(false),
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

// Обещание без сроков: оператор может ответить через минуту, а может через
// час, и «отвечу через пару минут» в три часа ночи — то же самое «обратитесь
// в поддержку», только с таймером.
const ESCALATION_ACCEPTED_MESSAGE =
  "Передал вопрос специалисту — ответ придёт сюда же, в этот чат.";

// Передать не вышло: группа поддержки не настроена или Telegram не ответил.
// Врать про «передал» в этом случае нельзя.
const ESCALATION_FAILED_MESSAGE =
  "Точного ответа на это у меня нет, а передать вопрос специалисту сейчас не получается. Напиши чуть позже.";

// Мастер завалил поддержку вопросами за час. Отказ честный: обращения никуда
// не делись, специалист по ним ответит.
const ESCALATION_LIMIT_MESSAGE =
  "Твои вопросы уже у специалиста, он ответит по ним здесь. Новые пока не передаю.";

// Реплика ушла человеку — своего ответа у бота тут нет и быть не должно.
const FORWARDED_TO_OPERATOR_MESSAGE = "Передал специалисту.";

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  return anthropicClient;
}

// Неперсональный признак для оператора: по тарифу видно, что вообще доступно
// собеседнику, а имени и почты в группе поддержки быть не должно.
function describePlan(profile: {
  subscriptionTier: string;
  subscriptionUntil: string | null;
  joinedAt: string;
}): string {
  const access = resolveSubscription({
    subscriptionTier: profile.subscriptionTier,
    subscriptionUntil: profile.subscriptionUntil,
    joinedAt: profile.joinedAt,
  });

  if (access.isTrial) {
    return "пробный период";
  }

  if (access.planId) {
    return getPlan(access.planId).title;
  }

  return "без тарифа";
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

  const { message, history, isFirstMessageToday } = parsed.data;

  // Позвать живого оператора может только мастер в аккаунте: виджет висит и
  // на лендинге, а без личности вопрос анонима оператору не адресовать.
  // Демо-профиль не в счёт — за ним нет настоящей строки в базе.
  const authProfile = await getCurrentAuthProfile();
  const canEscalate = authProfile?.source === "supabase";

  // Открытый разговор со специалистом. Ищем до вызова модели: от него зависит
  // и промпт (модель должна видеть последнюю реплику оператора), и то, куда
  // уедет сообщение пользователя.
  const openEscalation = canEscalate
    ? await getOpenEscalation({ profileId: authProfile!.profile.id })
    : null;

  try {
    const systemPrompt = await buildSupportSystemPrompt(message, {
      isAuthenticated: canEscalate,
      isFirstMessageToday,
      openEscalationReply: openEscalation?.lastOperatorReply ?? null,
    });
    const client = getAnthropicClient();

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      // Ответы поддержки короткие по регламенту (1–3 предложения либо до 5
      // шагов), запас нужен только на длинную инструкцию.
      max_tokens: 600,
      system: systemPrompt,
      tools: [supportAnswerTool],
      // Ответ обязан прийти структурой: по свободному тексту не проверить ни
      // опору на базу знаний, ни выбранный исход.
      tool_choice: { type: "tool", name: supportAnswerToolName },
      messages: [
        ...history.map((entry) => ({
          role: entry.role,
          content: entry.fromOperator
            ? `[ответ специалиста, не твои слова]\n${entry.content}`
            : entry.content,
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

    const verdict = resolveSupportAnswer(answer.data, {
      isAuthenticated: canEscalate,
      question: message,
    });

    if (verdict.kind === "failed") {
      return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
    }

    // Реплика в открытый разговор со специалистом.
    //
    // Исход reply_to_operator лежит в схеме всегда, а инструкция к нему
    // появляется только при открытом разговоре — модель может выбрать его и
    // без ветки. Тогда это обычное обращение к человеку: ветки нет, но адресат
    // тот же, и заводить её надо, а не отвечать «передать не получается».
    if (verdict.kind === "forward" && openEscalation) {
      const forwarded = await forwardMasterReply({
        escalationId: openEscalation.id,
        telegramMessageId: openEscalation.telegramMessageId,
        code: openEscalation.code,
        text: verdict.text,
      });

      return NextResponse.json({
        reply: forwarded ? FORWARDED_TO_OPERATOR_MESSAGE : ESCALATION_FAILED_MESSAGE,
        suggestions: [],
        escalationId: forwarded ? openEscalation.id : undefined,
      });
    }

    if (verdict.kind === "reply") {
      // Пользователь ушёл с темы, ради которой звали человека. Держать
      // обращение открытым больше незачем: специалист иначе будет думать,
      // что его реплики ещё ждут.
      if (openEscalation) {
        await closeEscalation(openEscalation.id);
      }

      return NextResponse.json({
        reply: verdict.reply,
        suggestions: verdict.suggestions,
      });
    }

    if ((await countRecentEscalations({ profileId: authProfile!.profile.id })) >= escalationsPerHourLimit) {
      return NextResponse.json({ reply: ESCALATION_LIMIT_MESSAGE, suggestions: [] });
    }

    const escalation = await createSupportEscalation({
      profileId: authProfile!.profile.id,
      question: message,
      draftAnswer: answer.data.reply,
      // У forward без открытой ветки сути от модели нет — берём сам вопрос.
      summary: verdict.kind === "escalate" ? verdict.summary : message,
      planLabel: describePlan(authProfile!.profile),
    });

    if (!escalation) {
      return NextResponse.json({
        reply: ESCALATION_FAILED_MESSAGE,
        suggestions: [],
      });
    }

    return NextResponse.json({
      reply: ESCALATION_ACCEPTED_MESSAGE,
      suggestions: [],
      escalationId: escalation.id,
    });
  } catch (error) {
    // Не логируем и не пробрасываем пользователю тело ошибки API (может
    // содержать фрагменты system prompt или служебные детали) — только
    // технический факт в серверный лог.
    console.error("okno: support chat request failed", error);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }
}
