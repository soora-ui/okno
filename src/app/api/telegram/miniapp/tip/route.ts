import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured, isYooKassaConfigured } from "@/lib/env";
import { startTipPayment } from "@/lib/payments/tip-payment";
import {
  getClientIdentity,
  getClientPastBookings,
} from "@/lib/telegram/client-identity";
import { validateMiniAppInitData } from "@/lib/telegram/miniapp-auth";

// Чаевые из кабинета. Возвращает ссылку на оплату, а не редиректит: платёжную
// страницу мини-апп открывает наружу через openLink, потому что внутри вебвью
// Telegram 3-D Secure и возврат в приложение ведут себя непредсказуемо.
//
// Записи проверяем по личности: чаевые ставятся конкретному мастеру за
// конкретный визит, и оплатить чужой визит со своего аккаунта нельзя.

const requestSchema = z.object({
  initData: z.string(),
  bookingId: z.string().uuid(),
  amount: z.coerce.number().int(),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured || !isYooKassaConfigured) {
    return NextResponse.json({ error: "Оплата сейчас недоступна." }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверь сумму чаевых." }, { status: 400 });
  }

  const auth = validateMiniAppInitData(parsed.data.initData);

  if (auth.status !== "ok") {
    return NextResponse.json(
      { error: "Не получилось подтвердить, что это ты. Открой кабинет заново." },
      { status: 401 },
    );
  }

  const identity = await getClientIdentity({ telegramUserId: auth.user.telegramUserId });

  if (!identity) {
    return NextResponse.json(
      { error: "Сначала подтверди номер телефона." },
      { status: 403 },
    );
  }

  // Чаевые — только за свой прошедший визит. Список тот же, что рисует кабинет,
  // поэтому лишнего в нём оказаться не может.
  const past = await getClientPastBookings({ phoneHash: identity.phoneHash, limit: 50 });

  if (!past.some((booking) => booking.bookingId === parsed.data.bookingId)) {
    return NextResponse.json({ error: "Визит не найден." }, { status: 404 });
  }

  const result = await startTipPayment({
    bookingId: parsed.data.bookingId,
    amount: parsed.data.amount,
  });

  return result.ok
    ? NextResponse.json({ ok: true, confirmationUrl: result.confirmationUrl })
    : NextResponse.json({ error: result.message }, { status: 400 });
}
