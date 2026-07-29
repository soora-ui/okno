import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import { hashCertificateToken } from "@/lib/certificate-verification";
import { getClientIp } from "@/lib/public-booking-guards";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Проверка подарочного сертификата мастером при сканировании QR (ТЗ 2.3,
// 3.3). Авторизован как мастер — сканирование происходит в своем кабинете,
// сертификат должен принадлежать именно этому мастеру, даже если токен
// валиден. Отдельный шаг от /redeem — сам скан ничего не списывает.

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const attemptsByKey = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const recent = (attemptsByKey.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    attemptsByKey.set(key, recent);
    return false;
  }

  recent.push(now);
  attemptsByKey.set(key, recent);

  if (attemptsByKey.size > 5000) {
    for (const [mapKey, timestamps] of attemptsByKey) {
      if (timestamps.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
        attemptsByKey.delete(mapKey);
      }
    }
  }

  return true;
}

const verifyRequestSchema = z.object({
  certificateId: z.string().uuid(),
  token: z.string().trim().min(32).max(128),
});

const GENERIC_ERROR_MESSAGE = "Не получилось проверить сертификат.";

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Сервис пока недоступен." }, { status: 503 });
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile;
  if (!profile) {
    return NextResponse.json({ error: "Нужно войти в кабинет." }, { status: 401 });
  }

  if (!checkRateLimit(profile.id) || !checkRateLimit(getClientIp(request))) {
    return NextResponse.json(
      { error: "Слишком много попыток подряд. Подожди немного и попробуй снова." },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const parsed = verifyRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный QR-код." }, { status: 400 });
  }

  const tokenHash = hashCertificateToken(parsed.data.token);
  const admin = createSupabaseAdminClient();

  const { data: certificateRow, error } = await admin
    .from("gift_certificates")
    .select("id, amount, remaining_amount, status, expires_at, created_at")
    .eq("id", parsed.data.certificateId)
    .eq("token_hash", tokenHash)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (error) {
    logError("Certificate verify: lookup failed", { certificateId: parsed.data.certificateId, error });
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }

  if (!certificateRow) {
    return NextResponse.json({ ok: false, reason: "not_found" });
  }

  const isExpired = Boolean(
    certificateRow.expires_at && new Date(certificateRow.expires_at).getTime() <= Date.now(),
  );

  if (certificateRow.status !== "active" || isExpired) {
    if (certificateRow.status === "redeemed" || Number(certificateRow.remaining_amount) === 0) {
      const { data: lastRedemption } = await admin
        .from("certificate_redemptions")
        .select("created_at")
        .eq("certificate_id", certificateRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json({
        ok: false,
        reason: "exhausted",
        lastRedeemedAt: lastRedemption?.created_at ?? null,
      });
    }

    return NextResponse.json({ ok: false, reason: isExpired ? "expired" : "not_found" });
  }

  return NextResponse.json({
    ok: true,
    amount: Number(certificateRow.amount),
    remainingAmount: Number(certificateRow.remaining_amount),
    purchasedAt: certificateRow.created_at,
    expiresAt: certificateRow.expires_at,
    status: certificateRow.status,
  });
}
