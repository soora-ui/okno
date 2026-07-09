import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidPhoneNumber } from "@/lib/booking";
import {
  checkPhoneCallcheckStatus,
  isPhoneVerificationRequired,
  requestPhoneCallcheck,
  requestPhoneVerificationCode,
  verifyPhoneVerificationCode,
} from "@/lib/phone-verification";
import { getClientIp } from "@/lib/public-booking-guards";

const usernameSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,30}$/);

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send"),
    phone: z.string().refine(isValidPhoneNumber),
  }),
  z.object({
    action: z.literal("verify"),
    phone: z.string().refine(isValidPhoneNumber),
    code: z.string().trim().regex(/^\d{4,6}$/),
    // Токен привязывается к странице мастера, для которой подтверждали номер.
    username: usernameSchema,
  }),
  // Запасной канал: клиент сам звонит на номер от sms.ru.
  z.object({
    action: z.literal("callcheck"),
    phone: z.string().refine(isValidPhoneNumber),
  }),
  z.object({
    action: z.literal("callcheck-status"),
    phone: z.string().refine(isValidPhoneNumber),
    username: usernameSchema,
  }),
]);

export async function POST(request: Request) {
  if (!isPhoneVerificationRequired) {
    return NextResponse.json(
      { error: "Подтверждение по SMS сейчас не настроено." },
      { status: 503 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Проверь номер телефона и код." },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "send") {
      const clientIp = getClientIp(request);
      const ipHash = createHash("sha256").update(clientIp).digest("hex");
      // sms.ru требует IP клиента для защиты от флуда; для локальных
      // и неопределенных адресов документация велит передавать "-1".
      const isPublicIp =
        clientIp !== "unknown" && !/^(127\.|10\.|192\.168\.|::1)/.test(clientIp);
      const result = await requestPhoneVerificationCode({
        phone: parsed.data.phone,
        ip: isPublicIp ? clientIp : "-1",
        ipHash,
      });

      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, retryAfterSeconds: result.retryAfterSeconds },
          { status: 429 },
        );
      }

      return NextResponse.json({
        ok: true,
        retryAfterSeconds: result.retryAfterSeconds,
        channel: result.channel,
      });
    }

    if (parsed.data.action === "callcheck") {
      const ipHash = createHash("sha256")
        .update(getClientIp(request))
        .digest("hex");
      const result = await requestPhoneCallcheck({
        phone: parsed.data.phone,
        ipHash,
      });

      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, retryAfterSeconds: result.retryAfterSeconds },
          { status: 429 },
        );
      }

      return NextResponse.json({
        ok: true,
        callPhone: result.callPhone,
        callPhonePretty: result.callPhonePretty,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    if (parsed.data.action === "callcheck-status") {
      const result = await checkPhoneCallcheckStatus({
        phone: parsed.data.phone,
        username: parsed.data.username,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      if (result.confirmed) {
        return NextResponse.json({ ok: true, confirmed: true, token: result.token });
      }

      return NextResponse.json({
        ok: true,
        confirmed: false,
        expired: result.expired,
      });
    }

    const result = await verifyPhoneVerificationCode({
      phone: parsed.data.phone,
      code: parsed.data.code,
      username: parsed.data.username,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, token: result.token });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось обработать запрос. Попробуй еще раз.",
      },
      { status: 500 },
    );
  }
}
