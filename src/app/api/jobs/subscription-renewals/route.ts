import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env, isJobsSecretConfigured, isYooKassaConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { sweepStuckPendingPayments } from "@/lib/subscription-activation";
import { renewDueSubscriptions } from "@/lib/subscription-renewal";

// Автопродление подписки: списывает следующий период с привязанной карты у
// мастеров, чей оплаченный период закончился, и предупреждает остальных за
// три дня. Тот же паттерн авторизации, что и /api/jobs/prepayments —
// секрет в заголовке. Ходить раз в час: продление не срочное, но и тянуть с
// ним нельзя — без оплаты у мастера отключается публичная запись.
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

  if (!isYooKassaConfigured) {
    return NextResponse.json({ error: "ЮKassa не настроена." }, { status: 503 });
  }

  try {
    // Сначала разбираем зависшие платежи, потом списываем новые. Порядок
    // важен: платёж, по которому уведомление потерялось, продлевает подписку,
    // и после этого мастер уже не попадёт в выборку на списание — иначе с
    // него сняли бы деньги второй раз за тот же период.
    const pending = await sweepStuckPendingPayments();
    const result = await renewDueSubscriptions();

    return NextResponse.json({ ok: true, ...result, pending });
  } catch (error) {
    logError("Failed to renew due subscriptions", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось выполнить автопродление подписок.",
      },
      { status: 500 },
    );
  }
}
