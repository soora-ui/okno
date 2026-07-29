import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import { hashCertificateToken } from "@/lib/certificate-verification";
import { getClientIp } from "@/lib/public-booking-guards";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Списание (полное или частичное) подарочного сертификата мастером после
// сканирования QR (ТЗ 2.3, 3.3). Отдельный запрос от /verify — вызывается
// только явным действием мастера ("Списать N ₽"), не автоматически при
// скане. Никогда не доверяет тому, что /verify уже отработал — заново
// проверяет токен и владельца.

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

const redeemRequestSchema = z.object({
  certificateId: z.string().uuid(),
  token: z.string().trim().min(32).max(128),
  writeOffAmount: z.coerce.number().int().positive(),
});

const GENERIC_ERROR_MESSAGE = "Не получилось списать сертификат.";

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

  const parsed = redeemRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверь сумму списания." }, { status: 400 });
  }

  const tokenHash = hashCertificateToken(parsed.data.token);
  const admin = createSupabaseAdminClient();

  const { data: certificateRow, error: lookupError } = await admin
    .from("gift_certificates")
    .select("id, remaining_amount, status, expires_at")
    .eq("id", parsed.data.certificateId)
    .eq("token_hash", tokenHash)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (lookupError) {
    logError("Certificate redeem: lookup failed", { certificateId: parsed.data.certificateId, error: lookupError });
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }

  if (!certificateRow) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const isExpired = Boolean(
    certificateRow.expires_at && new Date(certificateRow.expires_at).getTime() <= Date.now(),
  );

  if (certificateRow.status !== "active" || isExpired) {
    return NextResponse.json(
      { ok: false, reason: isExpired ? "expired" : "exhausted" },
      { status: 409 },
    );
  }

  if (parsed.data.writeOffAmount > Number(certificateRow.remaining_amount)) {
    return NextResponse.json(
      { ok: false, reason: "insufficient_balance", remainingAmount: Number(certificateRow.remaining_amount) },
      { status: 409 },
    );
  }

  const { data: redeemResult, error: redeemError } = await admin
    .rpc("redeem_gift_certificate", {
      p_certificate_id: parsed.data.certificateId,
      p_write_off_amount: parsed.data.writeOffAmount,
    })
    .select("id, remaining_amount, status")
    .maybeSingle();

  if (redeemError) {
    logError("Certificate redeem: rpc failed", { certificateId: parsed.data.certificateId, error: redeemError });
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }

  if (!redeemResult) {
    // WHERE-условие функции не совпало — сертификат успели списать/сменить
    // статус между /verify и этим запросом (гонка). Не внутренняя ошибка.
    return NextResponse.json({ ok: false, reason: "exhausted" }, { status: 409 });
  }

  const { error: auditRowError } = await admin.from("certificate_redemptions").insert({
    certificate_id: certificateRow.id,
    profile_id: profile.id,
    amount_written_off: parsed.data.writeOffAmount,
    balance_after: Number(redeemResult.remaining_amount),
    channel: "master_scan",
    redeemed_by_master_id: profile.id,
  });

  if (auditRowError) {
    logError("Certificate redeem: failed to write redemption audit row", {
      certificateId: certificateRow.id,
      error: auditRowError,
    });
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "gift_certificate.redeemed",
    targetType: "gift_certificate",
    targetId: certificateRow.id,
    metadata: { amountWrittenOff: parsed.data.writeOffAmount, channel: "master_scan" },
  });

  return NextResponse.json({
    ok: true,
    remainingAmount: Number(redeemResult.remaining_amount),
    status: redeemResult.status,
  });
}
