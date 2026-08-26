import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env, isJobsSecretConfigured, isNalogConfigured } from "@/lib/env";
import { syncNalogRefunds } from "@/lib/nalog/refunds";
import { processPendingNalogReceipts } from "@/lib/nalog/receipts";
import { logError } from "@/lib/observability/logger";

// Чеки НПД: выбивает в «Моём налоге» доход платформы (подписка мастеров и
// доплата за места) и аннулирует чеки по возвратам. Тот же паттерн
// авторизации, что и у остальных job — секрет в заголовке.
//
// Ходить раз в 10 минут: чек по безналу можно выбить и позже (ч. 3 ст. 14
// 422-ФЗ), но чем меньше очередь, тем короче разбор, если кабинет ФНС ляжет
// надолго.
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

  if (!isNalogConfigured) {
    return NextResponse.json({ error: "«Мой налог» не настроен." }, { status: 503 });
  }

  try {
    // Сначала чеки, потом возвраты. Возврат, приехавший в том же прогоне, что
    // и платёж, должен застать чек уже выбитым: тогда в кабинете останется
    // честная пара «доход + аннулирование». В обратном порядке строка молча
    // снялась бы с очереди, и следа от платежа не осталось бы вовсе.
    const receipts = await processPendingNalogReceipts();
    const refunds = await syncNalogRefunds();

    return NextResponse.json({ ok: true, receipts, refunds });
  } catch (error) {
    logError("Failed to run nalog receipts job", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось выбить чеки в «Моём налоге».",
      },
      { status: 500 },
    );
  }
}
