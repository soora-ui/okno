type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[truncated]";
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.split("\n").slice(0, 5).join("\n"),
    };
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
        if (/phone|password|token|secret|authorization|cookie|hash/i.test(key)) {
          return [key, "[redacted]"];
        }

        return [key, sanitizeValue(nestedValue, depth + 1)];
      }),
    );
  }

  return String(value);
}

function writeLog(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    app: "okno",
    level,
    message,
    timestamp: new Date().toISOString(),
    context: context ? sanitizeValue(context) : undefined,
  };

  const serialized = JSON.stringify(payload);

  if (level === "error" || level === "warn") {
    persistServerError(level, message, context);
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
  context?: LogContext,
) {
  if (typeof window !== "undefined") {
    return;
  }

  void import("./error-store")
    .then(({ recordErrorEvent }) =>
      recordErrorEvent({
        level,
        source: "server",
        message,
        route: typeof context?.route === "string" ? context.route : null,
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
