import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env, isJobsSecretConfigured } from "@/lib/env";
import {
  purgeExpiredEscalations,
  remindStaleEscalations,
} from "@/lib/support-assistant/escalation";

// Обслуживание обращений в поддержку: напомнить группе о висящем вопросе и
// удалить всё, что пережило срок хранения.
//
// Две несвязанные задачи в одной job намеренно: обе редкие, обе дешёвые, и
// заводить ради второй отдельный таймер на сервере не за что. Разумный
// интервал запуска — раз в пять минут: напоминание тогда приходит вовремя, а
// чистка всё равно срабатывает не чаще раза в сутки по сроку строк.

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
    const reminded = await remindStaleEscalations();
    const purged = await purgeExpiredEscalations();

    return NextResponse.json({ ok: true, reminded, purged });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось обслужить обращения в поддержку.",
      },
      { status: 500 },
    );
  }
}
