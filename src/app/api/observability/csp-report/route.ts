import { NextResponse } from "next/server";
import { logWarn } from "@/lib/observability/logger";

// Приёмник отчётов Content-Security-Policy (next.config.ts). Пишем в ленту
// /admin/errors, чтобы видеть, что политика заблокировала: новый внешний
// источник, который пора разрешить, или попытку инъекции. Один и тот же источник
// за час пишем один раз: браузер шлёт отчёт на каждую загрузку, а эндпоинт
// открыт всем.
const DEDUPE_MS = 60 * 60 * 1000;
const MAX_KEYS = 500;
const MAX_BODY_BYTES = 16 * 1024;
const seen = new Map<string, number>();

type CspReport = {
  "document-uri"?: unknown;
  "violated-directive"?: unknown;
  "effective-directive"?: unknown;
  "blocked-uri"?: unknown;
  "source-file"?: unknown;
  "line-number"?: unknown;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.slice(0, 500) : null;
}

// blocked-uri приходит полным адресом, а для решения хватает origin;
// так и ключ дедупа не раздувается от query-строк.
function blockedSource(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function shouldLog(key: string) {
  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < DEDUPE_MS) return false;
  if (seen.size >= MAX_KEYS) {
    for (const [storedKey, at] of seen) {
      if (now - at >= DEDUPE_MS) seen.delete(storedKey);
    }
    if (seen.size >= MAX_KEYS) return false;
  }
  seen.set(key, now);
  return true;
}

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 });
  }

  let report: CspReport | undefined;
  try {
    report = (JSON.parse(raw) as { "csp-report"?: CspReport })["csp-report"];
  } catch {
    report = undefined;
  }
  if (!report) {
    return new NextResponse(null, { status: 204 });
  }

  const directive = asText(report["effective-directive"]) ?? asText(report["violated-directive"]);
  const blocked = blockedSource(asText(report["blocked-uri"]));
  // eval блокируется штатно: zod проверяет его в try/catch на каждой загрузке.
  if (blocked === "eval") {
    return new NextResponse(null, { status: 204 });
  }
  if (directive && shouldLog(`${directive}|${blocked}`)) {
    logWarn("CSP violation", {
      directive,
      blocked,
      documentUri: asText(report["document-uri"]),
      sourceFile: asText(report["source-file"]),
      line: typeof report["line-number"] === "number" ? report["line-number"] : null,
    });
  }

  return new NextResponse(null, { status: 204 });
}
