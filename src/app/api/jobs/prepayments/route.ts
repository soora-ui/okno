import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env, isJobsSecretConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { expireStalePrepayments } from "@/lib/prepayment-expiry";

// Фоновая job протухших резерваций предоплаты (Модуль 2 из
// okno-tz-rating-prepayment.md, ТЗ 2.6). Освобождает слот, если клиент
// открыл оплату ЮKassa и не завершил её за 15 минут. Тот же паттерн
// авторизации, что и /api/jobs/notifications — секрет в заголовке.
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
    const result = await expireStalePrepayments();

    return NextResponse.json({
      ok: true,
      expiredPrepayments: result.expiredPrepayments,
      cancelledBookings: result.cancelledBookings,
    });
  } catch (error) {
    logError("Failed to expire stale prepayments", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось обработать протухшие предоплаты.",
      },
      { status: 500 },
    );
  }
}
