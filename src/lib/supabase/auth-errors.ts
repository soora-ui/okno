type SupabaseAuthErrorLike = {
  code?: unknown;
  status?: unknown;
  __isAuthError?: unknown;
  message?: unknown;
};

const NON_FATAL_SESSION_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "bad_jwt",
  "invalid_grant",
]);

export function isNonFatalSupabaseSessionError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const authError = error as SupabaseAuthErrorLike;
  const code = typeof authError.code === "string" ? authError.code : null;

  if (code && NON_FATAL_SESSION_CODES.has(code)) {
    return true;
  }

  return authError.__isAuthError === true && authError.status === 400;
}

function collectErrorMessages(error: unknown): string[] {
  if (!error || typeof error !== "object") {
    return [];
  }

  const target = error as {
    message?: unknown;
    code?: unknown;
    cause?: unknown;
  };

  const parts = [
    typeof target.message === "string" ? target.message : "",
    typeof target.code === "string" ? target.code : "",
  ];

  if (target.cause && typeof target.cause === "object") {
    const cause = target.cause as { message?: unknown; code?: unknown };
    parts.push(
      typeof cause.message === "string" ? cause.message : "",
      typeof cause.code === "string" ? cause.code : "",
    );
  }

  return parts.filter(Boolean).map((value) => value.toLowerCase());
}

export function isRetryableSupabaseNetworkError(error: unknown) {
  const messages = collectErrorMessages(error);

  return messages.some(
    (value) =>
      value.includes("fetch failed") ||
      value.includes("timedout") ||
      value.includes("timeout") ||
      value.includes("etimedout") ||
      value.includes("connect timeout") ||
      value.includes("terminated"),
  );
}

export function isSupabaseMissingColumnError(
  error: unknown,
  columnName?: string,
) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const target = error as { code?: unknown; cause?: unknown };
  const directCode = typeof target.code === "string" ? target.code : null;
  const causeCode =
    target.cause &&
    typeof target.cause === "object" &&
    typeof (target.cause as { code?: unknown }).code === "string"
      ? ((target.cause as { code?: unknown }).code as string)
      : null;

  if (directCode !== "42703" && causeCode !== "42703") {
    return false;
  }

  if (!columnName) {
    return true;
  }

  const normalizedColumnName = columnName.toLowerCase();
  return collectErrorMessages(error).some((value) =>
    value.includes(normalizedColumnName),
  );
}

export function isSupabaseUndefinedRoutineError(
  error: unknown,
  routineName?: string,
) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const target = error as { code?: unknown; cause?: unknown };
  const directCode = typeof target.code === "string" ? target.code : null;
  const causeCode =
    target.cause &&
    typeof target.cause === "object" &&
    typeof (target.cause as { code?: unknown }).code === "string"
      ? ((target.cause as { code?: unknown }).code as string)
      : null;

  const isUndefinedRoutineCode =
    directCode === "42883" ||
    causeCode === "42883" ||
    directCode === "PGRST202" ||
    causeCode === "PGRST202";

  if (!isUndefinedRoutineCode) {
    return false;
  }

  if (!routineName) {
    return true;
  }

  const normalizedRoutineName = routineName.toLowerCase();
  return collectErrorMessages(error).some(
    (value) =>
      value.includes(normalizedRoutineName) ||
      value.includes("could not find the function") ||
      value.includes("no matches were found in the schema cache"),
  );
}

export function isSupabaseBookingOverlapError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const target = error as { code?: unknown; cause?: unknown };
  const directCode = typeof target.code === "string" ? target.code : null;
  const causeCode =
    target.cause &&
    typeof target.cause === "object" &&
    typeof (target.cause as { code?: unknown }).code === "string"
      ? ((target.cause as { code?: unknown }).code as string)
      : null;

  if (directCode === "23P01" || causeCode === "23P01") {
    return true;
  }

  return collectErrorMessages(error).some((value) =>
    value.includes("bookings_no_overlap_excl"),
  );
}

export function isSupabaseMissingTableError(
  error: unknown,
  tableName?: string,
) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const target = error as { code?: unknown; cause?: unknown };
  const directCode = typeof target.code === "string" ? target.code : null;
  const causeCode =
    target.cause &&
    typeof target.cause === "object" &&
    typeof (target.cause as { code?: unknown }).code === "string"
      ? ((target.cause as { code?: unknown }).code as string)
      : null;

  const isMissingTableCode =
    directCode === "42P01" ||
    causeCode === "42P01" ||
    directCode === "PGRST205" ||
    causeCode === "PGRST205";

  if (!isMissingTableCode) {
    return false;
  }

  if (!tableName) {
    return true;
  }

  const normalizedTableName = tableName.toLowerCase();
  return collectErrorMessages(error).some(
    (value) =>
      value.includes(normalizedTableName) ||
      value.includes("could not find the table") ||
      value.includes("does not exist"),
  );
}
