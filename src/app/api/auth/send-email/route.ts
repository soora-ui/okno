import { after, NextResponse } from "next/server";
import {
  planAuthEmails,
  verifyHookSignature,
  type SendEmailHookPayload,
} from "@/lib/auth/email-hook";
import { buildAuthEmail } from "@/lib/email/templates/auth";
import { sendEmail } from "@/lib/email/unisender";
import { env, isEmailConfigured } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";

// Хук Send Email сервера авторизации (GoTrue): вместо своего SMTP он отдаёт
// письмо сюда, а мы шлём его через Unisender Go. См. src/lib/auth/email-hook.ts.
//
// GoTrue ждёт ответа около 5 секунд, а Unisender через прокси в РФ иногда
// отвечает дольше. Поэтому ждём отправку не дольше sendWaitMs: быструю
// ошибку возвращаем (GoTrue покажет её пользователю, он нажмёт «Отправить
// ещё раз»), а медленную отправку дописываем в фоне через after().

const sendWaitMs = 3500;

function hookError(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

export async function POST(request: Request) {
  const secret = env.sendEmailHookSecret;
  if (!secret) {
    return hookError(503, "Send email hook is not configured.");
  }

  const body = await request.text();
  const isValid = verifyHookSignature({
    secret,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    body,
  });

  if (!isValid) {
    logWarn("Auth email hook: bad signature");
    return hookError(401, "Invalid signature.");
  }

  let payload: SendEmailHookPayload;
  try {
    payload = JSON.parse(body) as SendEmailHookPayload;
  } catch {
    return hookError(400, "Invalid payload.");
  }

  const actionType = payload.email_data?.email_action_type;
  const messages = planAuthEmails(payload, env.appUrl);

  if (messages.length === 0) {
    logWarn("Auth email hook: nothing to send", { actionType, userId: payload.user?.id });
    return NextResponse.json({});
  }

  if (!isEmailConfigured) {
    logError("Auth email hook: email is not configured", { actionType });
    return hookError(503, "Email sending is not configured.");
  }

  const sending = Promise.all(
    messages.map(async (message) => {
      const template = buildAuthEmail(message, env.appUrl);
      const result = await sendEmail({
        to: message.to,
        subject: template.subject,
        html: template.html,
        plaintext: template.plaintext,
        tags: ["auth", message.kind],
        metadata: { kind: `auth_${message.kind}`, user_id: payload.user.id },
      });

      if (result.ok || ("duplicate" in result && result.duplicate)) {
        logInfo("Auth email sent", { kind: message.kind, role: message.role, userId: payload.user.id });
        return true;
      }

      logError("Auth email failed", {
        kind: message.kind,
        role: message.role,
        userId: payload.user.id,
        error: result.error,
      });
      return false;
    }),
  );
  after(() => sending.catch(() => undefined));

  const outcome = await Promise.race([
    sending.then((results) => (results.every(Boolean) ? "sent" : "failed")),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), sendWaitMs)),
  ]).catch(() => "failed" as const);

  if (outcome === "failed") {
    return hookError(502, "Не получилось отправить письмо. Попробуй ещё раз через минуту.");
  }

  return NextResponse.json({});
}
