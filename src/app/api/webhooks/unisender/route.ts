import { NextResponse, after } from "next/server";
import { recordEmailLog } from "@/lib/email/notification-log";
import {
  parseUnisenderWebhook,
  verifyUnisenderSignature,
  type UnisenderEmailEvent,
} from "@/lib/email/webhook";
import { isEmailConfigured } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";

// Вход событий доставки. Unisender Go ждёт 200 в течение трёх секунд, иначе
// начинает слать этот же пакет повторно, поэтому запись в базу уходит в
// after(): ответ отдаётся сразу, обработка идёт после него.
//
// after() из next/server — родной механизм Next.js, работающий и на обычном
// node-сервере (у нас systemd + nginx), в отличие от waitUntil из
// @vercel/functions, который живёт только внутри Vercel.

async function processEvents(events: UnisenderEmailEvent[]) {
  for (const event of events) {
    const emailType =
      typeof event.metadata.email_type === "string" ? event.metadata.email_type : null;

    await recordEmailLog({
      jobId: event.jobId,
      recipient: event.email,
      status: event.status,
      emailType,
      errorMessage: event.errorMessage,
      metadata: event.metadata,
      eventAt: event.eventAt,
    });
  }
}

export async function POST(request: Request) {
  if (!isEmailConfigured) {
    return NextResponse.json({ error: "Отправка почты не настроена." }, { status: 503 });
  }

  // Тело читаем как текст: подпись считается по исходной строке, повторная
  // сериализация разобранного JSON дала бы другой хеш.
  const rawBody = await request.text();

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса." }, { status: 400 });
  }

  const parsed = parseUnisenderWebhook(payload);

  if (!parsed) {
    return NextResponse.json({ error: "Неизвестный формат вебхука." }, { status: 400 });
  }

  if (!verifyUnisenderSignature(rawBody, parsed.auth)) {
    logWarn("Unisender webhook signature mismatch");

    return NextResponse.json({ error: "Доступ запрещен." }, { status: 401 });
  }

  for (const block of parsed.spamBlocks) {
    // Блокировка нашего SMTP-сервера у принимающего домена не привязана к
    // конкретному письму — в журнал её класть некуда, но знать о ней надо.
    logWarn("Unisender spam block event", { ...block });
  }

  if (parsed.emailEvents.length > 0) {
    after(async () => {
      try {
        await processEvents(parsed.emailEvents);
      } catch (error) {
        logError("Unisender webhook processing failed", {
          events: parsed.emailEvents.length,
          error,
        });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
