import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/public-booking-guards";
import { claimCertificateByCode } from "@/lib/telegram/client-certificates";
import { getClientIdentity } from "@/lib/telegram/client-identity";
import { validateMiniAppInitData } from "@/lib/telegram/miniapp-auth";

// Привязка сертификата к кабинету по коду.
//
// Код предъявительский и криптостойкий (OKNO-XXXX-XXXX-XXXX из алфавита без
// похожих символов), перебрать его нельзя. Лимит всё равно стоит: он дешевле
// рассуждений о том, насколько «нельзя» надёжно.

const requestSchema = z.object({
  initData: z.string(),
  code: z.string().trim().min(4).max(40),
});

const attemptsByIp = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function consumeLimit(key: string) {
  const now = Date.now();
  const entry = attemptsByIp.get(key);

  if (!entry || entry.resetAt < now) {
    attemptsByIp.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверь код сертификата." }, { status: 400 });
  }

  const auth = validateMiniAppInitData(parsed.data.initData);

  if (auth.status !== "ok") {
    return NextResponse.json(
      { error: "Не получилось подтвердить, что это ты. Открой кабинет заново." },
      { status: 401 },
    );
  }

  if (!consumeLimit(getClientIp(request))) {
    return NextResponse.json(
      { error: "Слишком много попыток подряд. Подожди минуту." },
      { status: 429 },
    );
  }

  const identity = await getClientIdentity({ telegramUserId: auth.user.telegramUserId });

  if (!identity) {
    return NextResponse.json(
      { error: "Сначала подтверди номер телефона." },
      { status: 403 },
    );
  }

  const result = await claimCertificateByCode({
    code: parsed.data.code,
    phoneHash: identity.phoneHash,
  });

  if (result.status === "claimed") {
    return NextResponse.json({ ok: true, certificate: result.certificate });
  }

  const messages: Record<string, string> = {
    not_found: "Такого сертификата нет. Проверь код.",
    not_usable: "Этот сертификат уже нельзя использовать.",
    taken: "Сертификат уже привязан к другому кабинету. Погасить его у мастера это не мешает.",
    failed: "Не получилось привязать. Попробуй ещё раз.",
  };

  return NextResponse.json(
    { error: messages[result.status] ?? messages.failed },
    { status: result.status === "failed" ? 500 : 400 },
  );
}
