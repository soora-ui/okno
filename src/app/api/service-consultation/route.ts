import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env, isSupportAssistantConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import {
  getConsultantBooking,
  getConsultantContext,
  getConsultantSlotsFrom,
} from "@/lib/repositories/consultant-repository";
import {
  buildFallbackReply,
  consultantAnswerSchema,
  resolveConsultantAnswer,
} from "@/lib/service-consultant/answer";
import {
  buildConsultantSystemPrompt,
  consultantAnswerTool,
  consultantAnswerToolName,
  consultantMaxHistoryMessages,
  consultantMaxUserMessageLength,
} from "@/lib/service-consultant/prompt";
import {
  buildRepeatVisitOffer,
  resolveRepeatVisitDate,
} from "@/lib/service-consultant/repeat-visit";
import { hasCapability } from "@/lib/subscription";

// AI-консультант для КЛИЕНТОВ мастера: отвечает по мануалу конкретной услуги.
// Отдельная фича от AI-поддержки сервиса (/api/support-chat), где собеседник —
// сам мастер, а база знаний — карта функционала okno.
//
// Два входа в один роут:
//   • token — клиент пришёл по ссылке управления записью. Запись известна,
//     значит известны и услуга, и дата визита: можно предложить записаться
//     повторно.
//   • serviceId — клиент на публичной странице мастера. Аноним, визита нет,
//     повторная запись недоступна.

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(consultantMaxUserMessageLength),
});

const requestSchema = z
  .object({
    message: z.string().trim().min(1).max(consultantMaxUserMessageLength),
    history: z
      .array(messageSchema)
      .max(consultantMaxHistoryMessages)
      .optional()
      .default([]),
    token: z.string().trim().min(1).max(200).optional(),
    serviceId: z.string().trim().uuid().optional(),
  })
  .refine((data) => Boolean(data.token) || Boolean(data.serviceId), {
    message: "Нужен либо токен записи, либо услуга.",
  });

// Рейт-лимит на IP — по образцу /api/support-chat. Клиентов у мастера больше,
// чем мастеров, но и вопросов у одного человека немного: десять сообщений в
// минуту с одного адреса покрывают живую переписку с запасом.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const attemptsByIp = new Map<string, number[]>();

// Отдельный лимит на мастера, которого нет у поддержки, и вот почему: виджет
// висит на публичной странице, открыть её может кто угодно, а токены Claude
// платит okno. Без потолка одна вкладка с автоскриптом выжигает бюджет на
// чужом аккаунте. Сутки — потому что фича справочная, а не диалоговая.
const PROFILE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const PROFILE_LIMIT_MAX_REQUESTS = 200;
const attemptsByProfile = new Map<string, number[]>();

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

function consumeLimit(
  store: Map<string, number[]>,
  key: string,
  windowMs: number,
  maxRequests: number,
): boolean {
  const now = Date.now();
  const recent = (store.get(key) ?? []).filter(
    (timestamp) => now - timestamp < windowMs,
  );

  if (recent.length >= maxRequests) {
    store.set(key, recent);
    return false;
  }

  recent.push(now);
  store.set(key, recent);

  if (store.size > 5000) {
    for (const [entryKey, timestamps] of store) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
        store.delete(entryKey);
      }
    }
  }

  return true;
}

const GENERIC_ERROR_MESSAGE =
  "Не получилось получить ответ. Попробуй ещё раз чуть позже.";

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
      { error: "Консультант временно недоступен." },
      { status: 503 },
    );
  }

  if (
    !consumeLimit(
      attemptsByIp,
      getClientIp(request),
      RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MAX_REQUESTS,
    )
  ) {
    return NextResponse.json(
      { error: "Слишком много сообщений подряд. Подожди немного." },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Проверь сообщение — оно пустое или слишком длинное." },
      { status: 400 },
    );
  }

  const { message, history, token, serviceId } = parsed.data;

  // Запись по токену определяет и услугу, и дату визита. Переданный заодно
  // serviceId игнорируется намеренно: иначе по чужому токену можно было бы
  // подставить любую услугу.
  const booking = token ? await getConsultantBooking({ cancellationToken: token }) : null;

  if (token && !booking) {
    return NextResponse.json(
      { error: "Ссылка на запись устарела." },
      { status: 404 },
    );
  }

  const resolvedServiceId = booking?.serviceId ?? serviceId;
  if (!resolvedServiceId) {
    return NextResponse.json({ error: "Услуга не найдена." }, { status: 400 });
  }

  const context = await getConsultantContext({ serviceId: resolvedServiceId });
  if (!context) {
    return NextResponse.json(
      { error: "По этой услуге консультации нет." },
      { status: 404 },
    );
  }

  const { profile, service, manual } = context;

  // Тариф проверяется здесь, а не только при сохранении мануала: мастер мог
  // написать мануал на «Соло. Расширенном», а сейчас быть на базовом. Иначе
  // фича продолжала бы работать после того, как подписка кончилась.
  if (!hasCapability(profile, "aiConsultation")) {
    return NextResponse.json(
      { error: "По этой услуге консультации нет." },
      { status: 404 },
    );
  }

  if (
    !consumeLimit(
      attemptsByProfile,
      profile.id,
      PROFILE_LIMIT_WINDOW_MS,
      PROFILE_LIMIT_MAX_REQUESTS,
    )
  ) {
    return NextResponse.json(
      { error: "Консультант сегодня недоступен. Напиши мастеру напрямую." },
      { status: 429 },
    );
  }

  const masterContact = profile.bookingPageSettings.masterContact.trim() || null;
  const canOfferRepeatVisit = Boolean(booking && service.repeatIntervalDays);

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      // Ответы короткие по регламенту (1–3 предложения либо до 5 шагов),
      // запас нужен только на цитату из мануала.
      max_tokens: 700,
      system: buildConsultantSystemPrompt({
        serviceTitle: service.title,
        masterName: profile.fullName,
        manual,
        masterContact,
        canOfferRepeatVisit,
      }),
      tools: [consultantAnswerTool],
      // Ответ обязан прийти структурой: по свободному тексту не проверить ни
      // опору на мануал, ни выбранный исход.
      tool_choice: { type: "tool", name: consultantAnswerToolName },
      messages: [
        ...history.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        { role: "user" as const, content: message },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({
        reply: buildFallbackReply(masterContact),
        showMedicalDisclaimer: false,
        repeatVisit: null,
      });
    }

    const toolBlock = response.content.find(
      (block) => block.type === "tool_use" && block.name === consultantAnswerToolName,
    );

    const answer =
      toolBlock && toolBlock.type === "tool_use"
        ? consultantAnswerSchema.safeParse(toolBlock.input)
        : null;

    if (!answer?.success) {
      return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
    }

    const verdict = resolveConsultantAnswer(answer.data, {
      manual,
      masterContact,
    });

    let repeatVisit = null;

    if (verdict.wantsRepeatVisit && booking) {
      const earliest = resolveRepeatVisitDate({
        lastVisitIso: booking.startsAtIso,
        repeatIntervalDays: service.repeatIntervalDays,
        timezone: profile.timezone,
      });

      if (earliest) {
        const slots = await getConsultantSlotsFrom({
          profile,
          service,
          fromDate: earliest.toISODate() ?? "",
          excludeBookingId: booking.bookingId,
        });

        repeatVisit = buildRepeatVisitOffer({
          earliest,
          slots,
          serviceId: service.id,
          username: profile.username,
          timezone: profile.timezone,
        });
      }
    }

    // Времени предложить нечего: записи нет (публичная страница), расписание
    // до этой даты ещё не открыто или день занят целиком. Вопрос от этого не
    // исчезает — если ответ модели держится на мануале, он и остаётся ответом.
    // Обещать «загляни позже» не за что, поэтому без опоры зовём мастера.
    if (verdict.wantsRepeatVisit && !repeatVisit && !verdict.isGrounded) {
      return NextResponse.json({
        reply: buildFallbackReply(masterContact),
        showMedicalDisclaimer: false,
        repeatVisit: null,
      });
    }

    return NextResponse.json({
      reply: verdict.reply,
      showMedicalDisclaimer: verdict.showMedicalDisclaimer,
      repeatVisit,
    });
  } catch (error) {
    // Тело ошибки API наружу не отдаём: в нём могут оказаться фрагменты
    // системного промпта, то есть мануала мастера.
    logError("Service consultation request failed", { error });
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }
}
