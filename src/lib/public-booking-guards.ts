import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientIp } from "@/lib/net/client-ip";
import { logError } from "@/lib/observability/logger";

type AdminClient = SupabaseClient;

const MAX_PUBLIC_BOOKINGS_PER_WINDOW = 12;
const PUBLIC_BOOKING_WINDOW_MINUTES = 15;

type BookingRequestFingerprintInput = {
  username: string;
  serviceId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  note: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// Определение адреса вынесено в src/lib/net/client-ip.ts; реэкспорт оставлен
// для существующих импортов.
export { getClientIp };

// In-memory лимитер для демо-режима (без Supabase таблица попыток недоступна).
// Одного процесса достаточно: демо не масштабируется горизонтально.
const demoAttemptsByIp = new Map<string, number[]>();

export function assertDemoBookingRateLimit(request: Request) {
  const windowMs = PUBLIC_BOOKING_WINDOW_MINUTES * 60_000;
  const now = Date.now();
  const ipHash = sha256(getClientIp(request));
  const recentAttempts = (demoAttemptsByIp.get(ipHash) ?? []).filter(
    (timestamp) => now - timestamp < windowMs,
  );

  if (recentAttempts.length >= MAX_PUBLIC_BOOKINGS_PER_WINDOW) {
    demoAttemptsByIp.set(ipHash, recentAttempts);
    return {
      ok: false as const,
      message:
        "Слишком много попыток записи за короткое время. Попробуй еще раз чуть позже.",
    };
  }

  recentAttempts.push(now);
  demoAttemptsByIp.set(ipHash, recentAttempts);

  // Не даем карте расти бесконечно от ротации IP.
  if (demoAttemptsByIp.size > 10_000) {
    for (const [key, timestamps] of demoAttemptsByIp) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
        demoAttemptsByIp.delete(key);
      }
    }
  }

  return { ok: true as const };
}

export function buildBookingRequestHash(input: BookingRequestFingerprintInput) {
  return sha256(
    JSON.stringify({
      username: input.username.trim().toLowerCase(),
      serviceId: input.serviceId,
      date: input.date,
      time: input.time,
      name: input.name.trim(),
      phone: input.phone.replace(/\D/g, ""),
      note: input.note.trim(),
    }),
  );
}

export function buildIdempotencyKey(input: {
  request: Request;
  requestHash: string;
}) {
  return input.requestHash;
}

export async function assertPublicBookingRateLimit(input: {
  admin: AdminClient;
  profileId: string;
  username: string;
  request: Request;
}) {
  const ip = getClientIp(input.request);
  const ipHash = sha256(ip);
  const windowStart =
    DateTime.now()
      .minus({ minutes: PUBLIC_BOOKING_WINDOW_MINUTES })
      .toUTC()
      .toISO() ?? new Date().toISOString();

  const { count, error } = await input.admin
    .from("public_booking_attempts")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", input.profileId)
    .eq("ip_hash", ipHash)
    .gte("created_at", windowStart);

  if (error) {
    throw new Error("Не получилось проверить лимит запросов.");
  }

  if ((count ?? 0) >= MAX_PUBLIC_BOOKINGS_PER_WINDOW) {
    return {
      ok: false as const,
      ipHash,
      message: "Слишком много попыток записи за короткое время. Попробуй еще раз чуть позже.",
    };
  }

  const { error: insertError } = await input.admin.from("public_booking_attempts").insert({
    profile_id: input.profileId,
    username: input.username,
    ip_hash: ipHash,
  });

  if (insertError) {
    throw new Error("Не получилось сохранить попытку записи.");
  }

  return {
    ok: true as const,
    ipHash,
  };
}

type StoredIdempotencyRow = {
  id: string;
  request_hash: string;
  status: string;
  response_payload: unknown;
  booking_id: string | null;
};

export async function acquireBookingIdempotency(input: {
  admin: AdminClient;
  profileId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const { data: existingRow, error: existingError } = await input.admin
    .from("public_booking_idempotency")
    .select("id, request_hash, status, response_payload, booking_id")
    .eq("profile_id", input.profileId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle<StoredIdempotencyRow>();

  if (existingError) {
    throw new Error("Не получилось проверить повторную отправку формы.");
  }

  if (existingRow) {
    if (existingRow.request_hash !== input.requestHash) {
      return {
        kind: "mismatch" as const,
      };
    }

    if (existingRow.status === "completed" && existingRow.response_payload) {
      return {
        kind: "replay" as const,
        rowId: existingRow.id,
        payload: existingRow.response_payload,
      };
    }

    if (existingRow.status === "processing") {
      return {
        kind: "processing" as const,
        rowId: existingRow.id,
      };
    }

    const { error: resetError } = await input.admin
      .from("public_booking_idempotency")
      .update({
        status: "processing",
        response_payload: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRow.id);

    if (resetError) {
      throw new Error("Не получилось подготовить повторную отправку формы.");
    }

    return {
      kind: "acquired" as const,
      rowId: existingRow.id,
    };
  }

  const { data: insertedRow, error: insertError } = await input.admin
    .from("public_booking_idempotency")
    .insert({
      profile_id: input.profileId,
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
      status: "processing",
    })
    .select("id")
    .single();

  if (insertError || !insertedRow) {
    throw new Error("Не получилось зафиксировать запрос записи.");
  }

  return {
    kind: "acquired" as const,
    rowId: String(insertedRow.id),
  };
}

export async function completeBookingIdempotency(input: {
  admin: AdminClient;
  rowId: string;
  bookingId: string;
  payload: unknown;
}) {
  const { error } = await input.admin
    .from("public_booking_idempotency")
    .update({
      status: "completed",
      booking_id: input.bookingId,
      response_payload: input.payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.rowId);

  if (error) {
    logError("Failed to mark booking idempotency row as completed", {
      rowId: input.rowId,
      bookingId: input.bookingId,
      error,
    });
  }
}

export async function failBookingIdempotency(input: {
  admin: AdminClient;
  rowId: string;
  payload: unknown;
}) {
  const { error } = await input.admin
    .from("public_booking_idempotency")
    .update({
      status: "failed",
      response_payload: input.payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.rowId);

  if (error) {
    logError("Failed to mark booking idempotency row as failed", {
      rowId: input.rowId,
      error,
    });
  }
}
