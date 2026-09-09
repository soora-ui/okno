import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { formatPublicProfileLink } from "@/lib/site";
import { getConsultantContext } from "@/lib/repositories/consultant-repository";
import { hasCapability } from "@/lib/subscription";
import {
  getClientBookingsByPhoneHash,
  getClientIdentity,
  getClientPastBookings,
  getClientPendingPayments,
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
  // Ссылка на запись на ту же услугу к тому же мастеру.
  repeatUrl: string;
  // Консультант отвечает только по услуге с подтверждённым мануалом и только
  // пока у мастера действует тариф с этой возможностью.
  consultantAvailable: boolean;
  // Токен записи для /api/service-consultation: по нему консультант понимает,
  // на какой услуге человек был, и может предложить повторную запись. Отдаём
  // только когда консультант доступен — тот же токен уже есть у клиента в
  // ссылке управления записью, но раздавать его без нужды незачем.
  consultantToken: string | null;
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

  // Прошедшие визиты есть только у того, кто подтвердил номер: по привязке к
  // одной записи истории не собрать.
  const past = identity
    ? await getClientPastBookings({ phoneHash: identity.phoneHash })
    : [];

  const pendingPayment = identity
    ? await getClientPendingPayments({ phoneHash: identity.phoneHash })
    : [];

  return NextResponse.json(
    {
      ok: true,
      firstName: result.user.firstName,
      hasIdentity: Boolean(identity),
      bookings: await Promise.all(bookings.map(toMiniAppBooking)),
      past: await Promise.all(past.map(toMiniAppBooking)),
      pendingPayment: await Promise.all(
        pendingPayment.map(async (booking) => ({
          ...(await toMiniAppBooking(booking)),
          amountRub: booking.amountRub,
          confirmationUrl: booking.confirmationUrl,
        })),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function toMiniAppBooking(booking: {
  bookingId: string;
  profileId: string;
  serviceId: string | null;
  masterName: string;
  masterUsername: string;
  serviceTitle: string;
  startsAtIso: string;
  timezone: string;
  cancellationToken: string | null;
}): Promise<MiniAppBooking> {
  const startsAt = DateTime.fromISO(booking.startsAtIso, { zone: "utc" }).setZone(
    booking.timezone,
  );
  const masterUrl = `https://${formatPublicProfileLink(booking.masterUsername)}`;
  const consultantAvailable = await isConsultantAvailable(booking.serviceId);

  return {
    repeatUrl: booking.serviceId
      ? `${masterUrl}/book?service=${booking.serviceId}`
      : masterUrl,
    consultantAvailable,
    consultantToken: consultantAvailable ? booking.cancellationToken : null,
    bookingId: booking.bookingId,
    masterName: booking.masterName,
    masterUsername: booking.masterUsername,
    masterUrl,
    serviceTitle: booking.serviceTitle,
    startsAtIso: booking.startsAtIso,
    // Время считаем на сервере в часовом поясе мастера: у клиента в телефоне
    // может стоять другой, и «14:00» превратилось бы в «12:00».
    startsAtLabel: startsAt.setLocale("ru").toFormat("d MMMM, HH:mm"),
    cancelUrl: booking.cancellationToken ? `/cancel/${booking.cancellationToken}` : null,
  };
}

// Тариф проверяется здесь, а не только в самом консультанте: мастер мог
// написать мануал на расширенном тарифе, а сейчас быть на базовом. Иначе
// кабинет предлагал бы кнопку, которая ответит отказом.
async function isConsultantAvailable(serviceId: string | null) {
  if (!serviceId) {
    return false;
  }

  const context = await getConsultantContext({ serviceId });

  return Boolean(context && hasCapability(context.profile, "aiConsultation"));
}
