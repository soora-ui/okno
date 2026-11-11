import { createHash } from "node:crypto";
import { getClientIp, rateLimitKeyForIp } from "@/lib/net/client-ip";
import { logInfo, logWarn } from "@/lib/observability/logger";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env, isSupportAssistantConfigured } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import { getPlan } from "@/config/plans";
import { resolveSubscription } from "@/lib/subscription";
import {
  countGroundedSources,
  resolveSupportAnswer,
  supportAnswerSchema,
} from "@/lib/support-assistant/answer";
import { applySupportGreeting } from "@/lib/support-assistant/greeting";
import {
  closeEscalation,
  countRecentEscalations,
  createSupportEscalation,
  escalationsPerHourLimit,
  forwardMasterReply,
  getOpenEscalation,
} from "@/lib/support-assistant/escalation";
import { signSupportMessage } from "@/lib/support-assistant/history-signature";
import {
  buildRetrievalContext,
  keepAuthenticHistory,
  trimHistory,
} from "@/lib/support-assistant/history";
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
  // Подпись сервера у реплик бота и специалиста (history-signature.ts).
  // Без неё реплика ассистента в историю не попадает.
  sig: z.string().max(64).optional(),
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

function checkRateLimit(request: Request): boolean {
  const now = Date.now();
  // IPv6 — по подсети /64: владельцу такой подсети доступны миллиарды
  // адресов, и лимит на отдельный адрес он обходит сменой хвоста.
  const ip = rateLimitKeyForIp(getClientIp(request));
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

// Ошибки отдаём со статусом 200 и полем error. На 502/504 от сервера
// Cloudflare подменяет тело своей страницей «error code: 502», виджет не
// может её разобрать, и пользователь вместо нашего текста видит общую ошибку.
function errorReply(message: string) {
  return NextResponse.json({ error: message });
}

// Ответ от имени бота. Подпись виджет хранит рядом с текстом и присылает
// обратно в истории — без неё реплика в контекст модели не попадёт.
function botReply(body: { reply: string; suggestions: string[]; escalationId?: string }) {
  return NextResponse.json({ ...body, sig: signSupportMessage("bot", body.reply) });
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

// Мастер дописал в ветку уже supportForwardsWithoutReplyLimit реплик, а
// специалист ещё не ответил. Ничего не потеряно: прошлые реплики у него.
const FORWARD_LIMIT_MESSAGE =
  "Специалист ещё не ответил на прошлые сообщения — они у него. Дождись ответа здесь, потом сможешь дописать.";

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
  subscriptionPausedUntil: string | null;
  joinedAt: string;
}): string {
  const access = resolveSubscription({
    subscriptionTier: profile.subscriptionTier,
    subscriptionUntil: profile.subscriptionUntil,
    subscriptionPausedUntil: profile.subscriptionPausedUntil,
    joinedAt: profile.joinedAt,
  });

  if (access.pausedUntil) {
    return "подписка на паузе";
  }

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

  const { message, isFirstMessageToday } = parsed.data;
  const authenticHistory = keepAuthenticHistory(parsed.data.history);
  const history = trimHistory(authenticHistory);
  const startedAt = Date.now();

  // След каждого ответа в лог — без текста переписки. По нему видно, как
  // часто бот зовёт человека, отвечает без опоры на базу, сколько стоит
  // запрос и попадает ли промпт в кэш. Раньше на проде не было видно ничего,
  // кроме исключений.
  const trace: Record<string, unknown> = {
    visitor: createHash("sha256")
      .update(`okno-support:${rateLimitKeyForIp(getClientIp(request))}`)
      .digest("hex")
      .slice(0, 12),
    messageChars: message.length,
    historySent: parsed.data.history.length,
    historyForged: parsed.data.history.length - authenticHistory.length,
    historyKept: history.length,
  };

  // Любой ответ бота: приветствие (код решает, нужно ли), подпись и след.
  const respond = (
    body: { reply: string; suggestions: string[]; escalationId?: string },
    verdict: string,
  ) => {
    logInfo("okno.support.answer", {
      ...trace,
      verdict,
      latencyMs: Date.now() - startedAt,
    });
    return botReply({
      ...body,
      reply: applySupportGreeting(body.reply, { isFirstMessageToday, message, history }),
    });
  };

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
      openEscalationReply: openEscalation?.lastOperatorReply ?? null,
      retrievalContext: buildRetrievalContext(history),
    });
    const client = getAnthropicClient();

    const response = await client.messages.create({
      model: env.supportAssistantModel,
      // Ответы поддержки короткие по регламенту (1–3 предложения либо до 5
      // шагов), запас нужен на длинную инструкцию и поля tool-ответа (sources,
      // summary, suggestions). При 600 составной вопрос упирался в лимит,
      // tool-ответ обрывался и не проходил разбор.
      max_tokens: 1024,
      // Правила и индекс тем одинаковы для всех запросов до деплоя — их
      // кэшируем; всё, что меняется от запроса к запросу, идёт после отметки.
      system: [
        { type: "text", text: systemPrompt.stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: systemPrompt.dynamic },
      ],
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

    Object.assign(trace, {
      authenticated: canEscalate,
      stopReason: response.stop_reason,
      // Имена без слова «token»: санитайзер логов (observability/sanitize.ts)
      // вырезает такие ключи как секреты, и счётчики приходили «[redacted]».
      usageInput: response.usage.input_tokens,
      usageOutput: response.usage.output_tokens,
      usageCacheRead: response.usage.cache_read_input_tokens ?? 0,
      usageCacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    });

    if (response.stop_reason === "refusal") {
      logInfo("okno.support.answer", {
        ...trace,
        verdict: "refusal",
        latencyMs: Date.now() - startedAt,
      });
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
      // Без текста пользователя: только то, что нужно, чтобы понять причину.
      logWarn("okno.support.answer_rejected", {
        ...trace,
        hasToolBlock: Boolean(toolBlock),
        issues: answer?.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`),
      });
      return errorReply(GENERIC_ERROR_MESSAGE);
    }

    Object.assign(trace, {
      outcome: answer.data.outcome,
      sources: answer.data.sources,
      groundedSources: countGroundedSources(answer.data.sources),
    });

    const verdict = resolveSupportAnswer(answer.data, {
      isAuthenticated: canEscalate,
      question: message,
      hasOpenEscalation: Boolean(openEscalation),
    });

    if (verdict.kind === "failed") {
      logWarn("okno.support.answer_empty", trace);
      return errorReply(GENERIC_ERROR_MESSAGE);
    }

    // Реплика в открытый разговор со специалистом. reply_to_operator без
    // открытой ветки resolveSupportAnswer уже превратил в обычное обращение.
    if (verdict.kind === "forward" && openEscalation) {
      const forwarded = await forwardMasterReply({
        escalationId: openEscalation.id,
        telegramMessageId: openEscalation.telegramMessageId,
        code: openEscalation.code,
        text: verdict.text,
        forwardsSinceReply: openEscalation.forwardsSinceReply,
      });

      return respond(
        {
          reply:
            forwarded === "sent"
              ? FORWARDED_TO_OPERATOR_MESSAGE
              : forwarded === "limit"
                ? FORWARD_LIMIT_MESSAGE
                : ESCALATION_FAILED_MESSAGE,
          suggestions: [],
          escalationId: forwarded === "sent" ? openEscalation.id : undefined,
        },
        `forward_${forwarded}`,
      );
    }

    if (verdict.kind === "reply") {
      // Пользователь ушёл с темы, ради которой звали человека. Держать
      // обращение открытым больше незачем: специалист иначе будет думать,
      // что его реплики ещё ждут.
      if (openEscalation) {
        await closeEscalation(openEscalation.id);
      }

      return respond({ reply: verdict.reply, suggestions: verdict.suggestions }, "reply");
    }

    // Сюда доходят только обращения к человеку, а звать его может только
    // мастер в аккаунте. Гость сюда попасть не должен (его needs_human
    // resolveSupportAnswer отдаёт текстом), но если всё же попал — раньше это
    // был TypeError на authProfile! и 502.
    if (!canEscalate || !authProfile) {
      return errorReply(GENERIC_ERROR_MESSAGE);
    }

    const recentEscalations = await countRecentEscalations({ profileId: authProfile.profile.id });
    if (recentEscalations === null) {
      return respond(
        { reply: ESCALATION_FAILED_MESSAGE, suggestions: [] },
        "escalation_count_failed",
      );
    }
    if (recentEscalations >= escalationsPerHourLimit) {
      return respond({ reply: ESCALATION_LIMIT_MESSAGE, suggestions: [] }, "escalation_limit");
    }

    const escalation = await createSupportEscalation({
      profileId: authProfile.profile.id,
      question: message,
      draftAnswer: answer.data.reply,
      // У forward без открытой ветки сути от модели нет — берём сам вопрос.
      summary: verdict.kind === "escalate" ? verdict.summary : message,
      planLabel: describePlan(authProfile.profile),
    });

    if (!escalation) {
      return respond({ reply: ESCALATION_FAILED_MESSAGE, suggestions: [] }, "escalation_failed");
    }

    return respond(
      { reply: ESCALATION_ACCEPTED_MESSAGE, suggestions: [], escalationId: escalation.id },
      "escalated",
    );
  } catch (error) {
    // Не логируем и не пробрасываем пользователю тело ошибки API (может
    // содержать фрагменты system prompt или служебные детали) — только
    // технический факт в серверный лог.
    console.error("okno: support chat request failed", error);
    return errorReply(GENERIC_ERROR_MESSAGE);
  }
}
