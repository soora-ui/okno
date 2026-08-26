import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env, isTelegramBotConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/telegram/bot";

// Вход бота. Адрес известен только Telegram и нам, но полагаться на это
// нельзя: единственная проверка подлинности — секрет, который Telegram
// присылает в заголовке и который мы задали при setWebhook.

function isSecretMatch(candidate: string | null, secret: string) {
  if (!candidate) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate);
  const secretBuffer = Buffer.from(secret);

  return (
    candidateBuffer.length === secretBuffer.length &&
    timingSafeEqual(candidateBuffer, secretBuffer)
  );
}

export async function POST(request: Request) {
  if (!isTelegramBotConfigured) {
    return NextResponse.json({ error: "Бот не настроен." }, { status: 503 });
  }

  if (
    !isSecretMatch(
      request.headers.get("x-telegram-bot-api-secret-token"),
      env.telegramWebhookSecret!,
    )
  ) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 401 });
  }

  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Некорректный апдейт." }, { status: 400 });
  }

  // Ответ всегда 200: на любой другой код Telegram будет присылать этот же
  // апдейт снова и снова. Ошибки обработки уходят в лог, а не в ретраи.
  try {
    await handleTelegramUpdate(update);
  } catch (error) {
    logError("Telegram webhook failed", { updateId: update?.update_id, error });
  }

  return NextResponse.json({ ok: true });
}
