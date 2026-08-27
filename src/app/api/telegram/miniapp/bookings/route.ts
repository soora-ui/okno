import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { formatPublicProfileLink } from "@/lib/site";
import {
  getClientBookingsByPhoneHash,
  getClientIdentity,
} from "@/lib/telegram/client-identity";
import { getClientBookingsByChat } from "@/lib/telegram/client-link";
import { validateMiniAppInitData } from "@/lib/telegram/miniapp-auth";

// Данные кабинета клиента.
//
// POST, а не GET: initData — это подпись, и ей не место в адресной строке,
// откуда она утекает в логи и историю. Сессии нет намеренно — подпись
// проверяется на каждом запросе, так что украденная cookie не даёт доступа,
// потому что cookie нет.

type MiniAppBooking = {
  bookingId: string;
  masterName: string;
  masterUsername: string;
  masterUrl: string;
  serviceTitle: string;
  startsAtIso: string;
  startsAtLabel: string;
  cancelUrl: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { initData?: string } | null;
  const result = validateMiniAppInitData(String(body?.initData ?? ""));

  if (result.status === "unconfigured") {
    return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  if (result.status === "expired") {
    return NextResponse.json({ ok: false, reason: "expired" }, { status: 401 });
  }

  if (result.status !== "ok") {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 401 });
  }

  const identity = await getClientIdentity({
    telegramUserId: result.user.telegramUserId,
  });

  // Поделился номером — видны все визиты у всех мастеров. Нет — только те
  // записи, которые он сам подключил ссылкой.
  const bookings = identity
    ? await getClientBookingsByPhoneHash({ phoneHash: identity.phoneHash })
    : await getClientBookingsByChat({ telegramUserId: result.user.telegramUserId });

  return NextResponse.json(
    {
      ok: true,
      firstName: result.user.firstName,
      hasIdentity: Boolean(identity),
      bookings: bookings.map(toMiniAppBooking),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function toMiniAppBooking(booking: {
  bookingId: string;
  masterName: string;
  masterUsername: string;
  serviceTitle: string;
  startsAtIso: string;
  timezone: string;
  cancellationToken: string | null;
}): MiniAppBooking {
  const startsAt = DateTime.fromISO(booking.startsAtIso, { zone: "utc" }).setZone(
    booking.timezone,
  );

  return {
    bookingId: booking.bookingId,
    masterName: booking.masterName,
    masterUsername: booking.masterUsername,
    masterUrl: `https://${formatPublicProfileLink(booking.masterUsername)}`,
    serviceTitle: booking.serviceTitle,
    startsAtIso: booking.startsAtIso,
    // Время считаем на сервере в часовом поясе мастера: у клиента в телефоне
    // может стоять другой, и «14:00» превратилось бы в «12:00».
    startsAtLabel: startsAt.setLocale("ru").toFormat("d MMMM, HH:mm"),
    cancelUrl: booking.cancellationToken ? `/cancel/${booking.cancellationToken}` : null,
  };
}
