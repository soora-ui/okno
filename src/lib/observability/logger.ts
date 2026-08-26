import { sanitizeLogContext } from "./sanitize";

type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function writeLog(level: LogLevel, message: string, context?: LogContext) {
  // Санитайзим один раз: раньше в консоль уходил разобранный контекст, а в
  // error_events — сырой, и любой Error там сплющивался в {}.
  const safeContext = sanitizeLogContext(context);

  const payload = {
    app: "okno",
    level,
    message,
    timestamp: new Date().toISOString(),
    context: safeContext ?? undefined,
  };

  const serialized = JSON.stringify(payload);

  if (level === "error" || level === "warn") {
    persistServerError(level, message, safeContext);
  }

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

// На сервере дублируем ошибки/предупреждения в таблицу error_events, чтобы они
// были видны в админке. Ленивый импорт под проверкой window держит admin-клиент
// (с сервис-ролью) вне клиентского бандла.
function persistServerError(
  level: "warn" | "error",
  message: string,
  context: LogContext | null,
) {
  if (typeof window !== "undefined") {
    return;
  }

  // route и digest вытаскиваем в отдельные колонки: по ним панель группирует
  // повторы. У ошибок рендера ключи называются иначе (routePath из
  // onRequestError), и раньше обе колонки оставались пустыми — все пятисотые
  // с разных страниц выглядели одной проблемой.
  const route =
    typeof context?.route === "string"
      ? context.route
      : typeof context?.routePath === "string"
        ? context.routePath
        : null;
  const digest = typeof context?.digest === "string" ? context.digest : null;

  void import("./error-store")
    .then(({ recordErrorEvent }) =>
      recordErrorEvent({
        level,
        source: "server",
        message,
        route,
        digest,
        context: context ?? null,
      }),
    )
    .catch((cause) => {
      console.error("Failed to load error store", cause);
    });
}

export function logInfo(message: string, context?: LogContext) {
  writeLog("info", message, context);
}

export function logWarn(message: string, context?: LogContext) {
  writeLog("warn", message, context);
}

export function logError(message: string, context?: LogContext) {
  writeLog("error", message, context);
}

export function reportError(error: unknown, context?: LogContext) {
  writeLog("error", "Unhandled application error", {
    ...context,
    error,
  });
}
