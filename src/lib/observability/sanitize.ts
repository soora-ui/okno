// Приведение произвольного контекста лога к тому, что переживает
// JSON.stringify и запись в jsonb.
//
// Главное здесь — Error. У него нет собственных перечисляемых свойств, поэтому
// JSON.stringify(new Error("boom")) даёт "{}", и ошибка, положенная в контекст
// как есть, доезжает до админки пустым объектом: было видно только заголовок
// «Failed to renew due subscriptions» без единого намёка на причину.
//
// Модуль отдельный от logger.ts, потому что тем же кодом пользуется
// error-store.ts, а logger.ts подгружает error-store ленивым импортом —
// статический импорт в обратную сторону замкнул бы цикл.

const SENSITIVE_KEY = /phone|password|token|secret|authorization|cookie|hash/i;
const MAX_DEPTH = 4;
const MAX_STRING = 300;
const MAX_ARRAY_ITEMS = 20;
const MAX_STACK_LINES = 5;

function sanitizeError(error: Error, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  if (error.stack) {
    result.stack = error.stack.split("\n").slice(0, MAX_STACK_LINES).join("\n");
  }

  // undici прячет настоящую причину обрыва (ECONNRESET, «other side closed»)
  // в cause: без неё в панели остаётся бесполезное «fetch failed».
  if (error.cause !== undefined && error.cause !== null) {
    result.cause = sanitizeLogValue(error.cause, depth + 1);
  }

  return result;
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return "[truncated]";
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean"
  ) {
    return value;
  }

  // NaN и Infinity JSON.stringify превращает в null — пишем их строкой, иначе
  // в панели у числового поля молча появляется пустота.
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }

  if (value instanceof Error) {
    return sanitizeError(value, depth);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "[invalid date]" : value.toISOString();
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeLogValue(item, depth + 1));

    return value.length > MAX_ARRAY_ITEMS
      ? [...items, `…ещё ${value.length - MAX_ARRAY_ITEMS}`]
      : items;
  }

  if (value instanceof Map) {
    return sanitizeLogValue(Object.fromEntries(value), depth);
  }

  if (value instanceof Set) {
    return sanitizeLogValue([...value], depth);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
        if (SENSITIVE_KEY.test(key)) {
          return [key, "[redacted]"];
        }

        return [key, sanitizeLogValue(nested, depth + 1)];
      }),
    );
  }

  return String(value);
}

// Верхний уровень контекста: всегда объект или null, чтобы его можно было без
// проверок класть в jsonb-колонку.
export function sanitizeLogContext(
  context: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!context) {
    return null;
  }

  const sanitized = sanitizeLogValue(context);

  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : null;
}
