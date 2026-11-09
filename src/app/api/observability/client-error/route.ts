import { NextResponse } from "next/server";
import { isErrorEventsEnabled } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import { recordErrorEvent } from "@/lib/observability/error-store";
import { getClientIp } from "@/lib/net/client-ip";

// Эндпоинт открыт всем (ошибки шлёт и незалогиненный посетитель), поэтому без
// ограничений им можно забить таблицу error_events и ленту /admin/errors.
// Живой странице хватает нескольких отчётов в минуту: одна поломка даёт
// одну-две ошибки, а цикл из одинаковых исключений нам целиком не нужен.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REPORTS = 10;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_TRACKED_IPS = 5000;
const reportsByIp = new Map<string, number[]>();

function consumeReportLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (reportsByIp.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX_REPORTS) {
    reportsByIp.set(ip, recent);
    return false;
  }

  recent.push(now);
  reportsByIp.set(ip, recent);

  if (reportsByIp.size > MAX_TRACKED_IPS) {
    for (const [key, timestamps] of reportsByIp) {
      if (timestamps.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
        reportsByIp.delete(key);
      }
    }
  }

  return true;
}

function asShortText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, maxLength) : null;
}

// Приёмник клиентских ошибок: instrumentation-client и global-error шлют сюда
// необработанные исключения, чтобы они попадали в ленту ошибок админки (помимо
// Sentry). Всегда отвечаем 2xx — сбор ошибок не должен ломать клиент.
export async function POST(request: Request) {
  // Сама запись всё равно отсечётся в recordErrorEvent, но выходим раньше:
  // в dev нет смысла разбирать тело и ходить за профилем ради строки, которую
  // никто не сохранит.
  if (!isErrorEventsEnabled) {
    return NextResponse.json({ ok: true, ignored: "disabled" });
  }

  let body: {
    message?: unknown;
    route?: unknown;
    digest?: unknown;
    context?: unknown;
  };

  if (!consumeReportLimit(getClientIp(request))) {
    return NextResponse.json({ ok: true, ignored: "rate_limited" });
  }

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: true, ignored: "too_large" });
    }
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ ok: true, ignored: "bad_json" });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: true, ignored: "bad_json" });
  }

  const message =
    typeof body.message === "string" && body.message.trim().length > 0
      ? body.message.trim()
      : null;

  if (!message) {
    return NextResponse.json({ ok: true, ignored: "no_message" });
  }

  // Привязываем ошибку к мастеру, если он залогинен (best-effort).
  let profileId: string | null = null;
  try {
    const authProfile = await getCurrentAuthProfile();
    profileId = authProfile?.profile.id ?? null;
  } catch {
    profileId = null;
  }

  await recordErrorEvent({
    level: "error",
    source: "client",
    message,
    route: asShortText(body.route, 300),
    digest: asShortText(body.digest, 100),
    profileId,
    context:
      body.context && typeof body.context === "object"
        ? (body.context as Record<string, unknown>)
        : null,
  });

  return NextResponse.json({ ok: true });
}
