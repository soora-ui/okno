import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { isSupabaseConfigured } from "@/lib/env";
import { buildCertificateVerifyUrl, hashCertificateToken } from "@/lib/certificate-verification";
import { formatCertificateAmount, renderCertificate } from "@/lib/certificates/render";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Скачивание готового PDF сертификата покупателем (ТЗ 2.2 — доставка
// только скачиванием, без email/SMS). Публичный роут без сессии — у
// покупателя нет аккаунта, поэтому единственная защита — токен из
// returnUrl ЮKassa (см. purchaseGiftCertificateAction), тот же токен зашит
// в QR-код на самом сертификате. PDF не кэшируется — рендерится на каждый
// запрос (satori/resvg, без Chromium, дёшево и детерминированно).

type RouteParams = {
  params: Promise<{ id: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Сервис пока недоступен." }, { status: 503 });
  }

  const { id: certificateId } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";

  if (!uuidPattern.test(certificateId) || token.length < 32) {
    return NextResponse.json({ error: "Некорректная ссылка на сертификат." }, { status: 400 });
  }

  const tokenHash = hashCertificateToken(token);
  const admin = createSupabaseAdminClient();

  const { data: certificateRow, error } = await admin
    .from("gift_certificates")
    .select("id, code, amount, status, expires_at, created_at, template_id")
    .eq("id", certificateId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    logError("Certificate download: lookup failed", { certificateId, error });
    return NextResponse.json({ error: "Не получилось загрузить сертификат." }, { status: 502 });
  }

  if (!certificateRow) {
    return NextResponse.json({ error: "Сертификат не найден." }, { status: 404 });
  }

  if (certificateRow.status === "pending" || certificateRow.status === "paid") {
    return NextResponse.json({ processing: true }, { status: 202 });
  }

  if (certificateRow.status === "canceled" || certificateRow.status === "expired") {
    return NextResponse.json({ error: "Сертификат недействителен." }, { status: 410 });
  }

  if (!certificateRow.template_id) {
    return NextResponse.json(
      { error: "Мастер еще не настроил дизайн сертификата. Обратись к мастеру напрямую." },
      { status: 409 },
    );
  }

  const { data: templateRow, error: templateError } = await admin
    .from("certificate_templates")
    .select("html_source")
    .eq("id", certificateRow.template_id)
    .maybeSingle();

  if (templateError || !templateRow) {
    logError("Certificate download: template lookup failed", {
      certificateId,
      templateId: certificateRow.template_id,
      error: templateError,
    });
    return NextResponse.json({ error: "Не получилось загрузить шаблон сертификата." }, { status: 502 });
  }

  const issueDate = DateTime.fromISO(certificateRow.created_at, { zone: "utc" })
    .setLocale("ru")
    .toFormat("d LLLL yyyy");
  const expiryDate = certificateRow.expires_at
    ? DateTime.fromISO(certificateRow.expires_at, { zone: "utc" }).setLocale("ru").toFormat("d LLLL yyyy")
    : "бессрочно";

  try {
    const { pdf } = await renderCertificate({
      htmlSource: templateRow.html_source,
      amount: formatCertificateAmount(Number(certificateRow.amount)),
      certNumber: certificateRow.code,
      issueDate,
      expiryDate,
      verifyUrl: buildCertificateVerifyUrl({ certificateId, token }),
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="okno-certificate-${certificateRow.code}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (renderErrorCause) {
    logError("Certificate download: render failed", { certificateId, error: renderErrorCause });
    return NextResponse.json({ error: "Не получилось собрать PDF сертификата." }, { status: 500 });
  }
}
