import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidPhoneNumber, normalizePhoneDigits } from "@/lib/booking";
import { logError } from "@/lib/observability/logger";
import {
  checkCallcheckStatus,
  checkPhoneVerificationCode,
  isPhoneVerificationRequired,
  requestPhoneCallcheck,
  requestPhoneVerificationCode,
} from "@/lib/phone-verification";
import { getClientIp } from "@/lib/public-booking-guards";
import { linkClientIdentityByVerifiedPhone } from "@/lib/telegram/client-identity";
import { validateMiniAppInitData } from "@/lib/telegram/miniapp-auth";

// Подтверждение номера в кабинете клиента.
//
// Зачем отдельно от кнопки «поделиться контактом»: телефон в Telegram и
// телефон, на который человек записывался, — разные вещи. Два номера у одного
// человека это норма, и без этого пути кабинет для него просто пуст.
//
// Проверка та же, что при записи: звонок-сброс (последние 4 цифры номера —
// код), а если оператор режет входящие flash-call — обратный звонок. SMS тут
// не годятся, они не доходят (docs/sms-setup.md).
//
// Право что-либо делать даёт только подпись мини-аппа: без неё чужой номер
// можно было бы привязать к своему telegram-аккаунту и читать чужие записи.

const phoneSchema = z.string().trim().min(6).max(24);

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), initData: z.string(), phone: phoneSchema }),
  z.object({
    action: z.literal("verify"),
    initData: z.string(),
    phone: phoneSchema,
    code: z.string().trim().min(3).max(8),
  }),
  z.object({ action: z.literal("callcheck"), initData: z.string(), phone: phoneSchema }),
  z.object({
    action: z.literal("callcheck-status"),
    initData: z.string(),
    phone: phoneSchema,
  }),
]);

export async function POST(request: Request) {
  if (!isPhoneVerificationRequired) {
    return NextResponse.json(
      { error: "Подтверждение номера сейчас не настроено." },
      { status: 503 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверь номер телефона и код." }, { status: 400 });
  }

  const auth = validateMiniAppInitData(parsed.data.initData);

  if (auth.status !== "ok") {
    return NextResponse.json(
      { error: "Не получилось подтвердить, что это ты. Открой кабинет заново." },
      { status: 401 },
    );
  }

  if (!isValidPhoneNumber(parsed.data.phone)) {
    return NextResponse.json({ error: "Проверь номер телефона." }, { status: 400 });
  }

  const phone = normalizePhoneDigits(parsed.data.phone);

  try {
    if (parsed.data.action === "send") {
      const clientIp = getClientIp(request);
      const isPublicIp =
        clientIp !== "unknown" && !/^(127\.|10\.|192\.168\.|::1)/.test(clientIp);

      const result = await requestPhoneVerificationCode({
        phone,
        ip: isPublicIp ? clientIp : "-1",
        ipHash: createHash("sha256").update(clientIp).digest("hex"),
      });

      return result.ok
        ? NextResponse.json({
            ok: true,
            channel: result.channel,
            retryAfterSeconds: result.retryAfterSeconds,
          })
        : NextResponse.json({ error: result.error }, { status: 429 });
    }

    if (parsed.data.action === "callcheck") {
      const result = await requestPhoneCallcheck({
        phone,
        ipHash: createHash("sha256").update(getClientIp(request)).digest("hex"),
      });

      return result.ok
        ? NextResponse.json({
            ok: true,
            callPhone: result.callPhone,
            callPhonePretty: result.callPhonePretty,
            retryAfterSeconds: result.retryAfterSeconds,
          })
        : NextResponse.json({ error: result.error }, { status: 429 });
    }

    if (parsed.data.action === "callcheck-status") {
      const result = await checkCallcheckStatus({ phone });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      if (!result.confirmed) {
        return NextResponse.json({ ok: true, confirmed: false, expired: result.expired });
      }

      return linkAndRespond({ telegramUserId: auth.user.telegramUserId, phone, request });
    }

    const result = await checkPhoneVerificationCode({ phone, code: parsed.data.code });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return linkAndRespond({ telegramUserId: auth.user.telegramUserId, phone, request });
  } catch (error) {
    logError("Mini app phone verification failed", { error });

    return NextResponse.json(
      { error: "Не получилось проверить номер. Попробуй ещё раз." },
      { status: 500 },
    );
  }
}

// Номер подтверждён — привязываем личность. chat_id берём тот же, что у
// telegram-аккаунта: в приватном чате он равен id пользователя.
async function linkAndRespond(input: {
  telegramUserId: string;
  phone: string;
  request: Request;
}) {
  const linked = await linkClientIdentityByVerifiedPhone({
    telegramUserId: input.telegramUserId,
    chatId: input.telegramUserId,
    phone: input.phone,
  });

  if (!linked) {
    return NextResponse.json(
      { error: "Номер подтверждён, но привязать не вышло. Попробуй ещё раз." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, confirmed: true });
}
