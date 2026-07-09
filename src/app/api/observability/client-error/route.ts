import { NextResponse } from "next/server";
import { getCurrentAuthProfile } from "@/lib/data";
import { recordErrorEvent } from "@/lib/observability/error-store";

// Приёмник клиентских ошибок: instrumentation-client и global-error шлют сюда
// необработанные исключения, чтобы они попадали в ленту ошибок админки (помимо
// Sentry). Всегда отвечаем 2xx — сбор ошибок не должен ломать клиент.
export async function POST(request: Request) {
  let body: {
    message?: unknown;
    route?: unknown;
    digest?: unknown;
    context?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
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
    route: typeof body.route === "string" ? body.route : null,
    digest: typeof body.digest === "string" ? body.digest : null,
    profileId,
    context:
      body.context && typeof body.context === "object"
        ? (body.context as Record<string, unknown>)
        : null,
  });

  return NextResponse.json({ ok: true });
}
