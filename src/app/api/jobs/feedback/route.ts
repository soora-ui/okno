import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env, isJobsSecretConfigured } from "@/lib/env";
import {
  sendExpiredSubscriptionSurveys,
  sendTrialEndedSurveys,
} from "@/lib/feedback/service";
import { processSubscriptionPauses } from "@/lib/subscription-pause";

// Обратная связь и пауза подписки — всё, что должно происходить без участия
// мастера:
//   • опрос в Telegram тем, у кого закончился пробный период без оплаты;
//   • опрос тем, у кого истёк оплаченный период и автопродления нет;
//   • напоминание за сутки до конца паузы и закрытие истёкших пауз.
//
// Разумный интервал — раз в час: опросы не срочные, а напоминание о паузе
// окном в сутки переживёт любой сбой отдельного прогона.

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
  const headerToken = request.headers.get("x-jobs-secret");
  const secret = env.jobsSecret;

  if (!secret) {
    return false;
  }

  return isSecretMatch(bearerToken, secret) || isSecretMatch(headerToken, secret);
}

export async function POST(request: Request) {
  if (!isJobsSecretConfigured) {
    return NextResponse.json(
      { error: "Фоновый jobs-secret не настроен." },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 401 });
  }

  try {
    const trialEnded = await sendTrialEndedSurveys();
    const expired = await sendExpiredSubscriptionSurveys();
    const pauses = await processSubscriptionPauses();

    return NextResponse.json({
      ok: true,
      trialEndedSurveys: trialEnded.sent,
      expiredSurveys: expired.sent,
      pauseReminders: pauses.reminded,
      pausesClosed: pauses.closed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось обработать обратную связь.",
      },
      { status: 500 },
    );
  }
}
