import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { recordEmailLog } from "@/lib/email/notification-log";
import { buildTestEmail } from "@/lib/email/templates/test";
import { sendEmail } from "@/lib/email/unisender";
import { env, isEmailConfigured } from "@/lib/env";

// Ручная проверка отправки. Роут закрыт секретом: открытый эндпоинт, который
// шлёт письма по переданному адресу, — это спам-релей, который найдут за день.

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

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const secret = env.unisenderWebhookSecret;

  if (!secret) {
    return false;
  }

  return isSecretMatch(bearerToken, secret);
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isEmailConfigured) {
    return NextResponse.json({ error: "Отправка почты не настроена." }, { status: 503 });
  }

  if (!env.unisenderWebhookSecret) {
    return NextResponse.json(
      { error: "Не задан UNISENDER_WEBHOOK_SECRET — роут отключён." },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 401 });
  }

  let to: string;

  try {
    const body = (await request.json()) as { to?: unknown };
    to = typeof body.to === "string" ? body.to.trim() : "";
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса." }, { status: 400 });
  }

  if (!emailPattern.test(to)) {
    return NextResponse.json({ error: "Некорректный адрес получателя." }, { status: 400 });
  }

  const template = buildTestEmail();

  const result = await sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    plaintext: template.plaintext,
    tags: ["test"],
    // email_type кладём в метаданные: вебхук может прийти раньше, чем мы
    // допишем строку журнала, и тогда тип письма он возьмёт отсюда.
    metadata: { email_type: "test" },
    // Ключ идемпотентности здесь намеренно не передаётся: проверку часто
    // повторяют подряд, а повтор с тем же ключом в течение минуты Unisender Go
    // отклоняет. Для событийных писем (подтверждение записи и т. п.) ключ
    // обязателен — см. docs/email-setup.md.
  });

  if (!result.ok) {
    await recordEmailLog({
      jobId: null,
      recipient: to,
      status: "failed",
      emailType: "test",
      subject: template.subject,
      errorMessage: result.error,
      metadata: result.code ? { api_code: result.code } : null,
    });

    return NextResponse.json(
      { ok: false, error: result.error, code: result.code, failedEmails: result.failedEmails },
      { status: 502 },
    );
  }

  await recordEmailLog({
    jobId: result.jobId,
    recipient: to,
    status: "queued",
    emailType: "test",
    subject: template.subject,
    metadata: { email_type: "test" },
  });

  // ok здесь означает «принято в очередь Unisender Go». Доставку покажет
  // вебхук, который обновит статус этой же строки журнала.
  return NextResponse.json({
    ok: true,
    jobId: result.jobId,
    emails: result.emails,
    failedEmails: result.failedEmails ?? {},
  });
}
