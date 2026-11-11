import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { buildYandexRouteUrl, normalizeBookingPageSettings } from "@/lib/booking-page-settings";
import { formatPublicProfileLink } from "@/lib/site";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getConsultantContext } from "@/lib/repositories/consultant-repository";
import { getReviewsByAuthor } from "@/lib/reviews";
import { getClientCertificates } from "@/lib/telegram/client-certificates";
import { hasCapability } from "@/lib/subscription";
import {
  getClientBookingsByPhoneHash,
  getClientIdentity,
  getClientPastBookings,
  getClientPendingPayments,
} from "@/lib/telegram/client-identity";
import { getClientBookingsByChat } from "@/lib/telegram/client-link";
import { getProfileByTelegramChat } from "@/lib/telegram/link";
import { resolveAvatar } from "@/lib/telegram/miniapp-catalog";
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
  // То же по частям — крупной карточке ближайшего визита они нужны разными
  // кеглями: «14 ноября», «пятница», «14:00», «Завтра».
  dayLabel: string;
  weekdayLabel: string;
  timeLabel: string;
  relativeLabel: string;
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
  // Карточка визита показывает мастера лицом и говорит, куда идти.
  masterAvatarUrl: string | null;
  masterSpecialty: string;
  city: string;
  address: string;
  // Маршрут в Яндекс Картах — только если мастер поставил точку на карте.
  routeUrl: string | null;
};

// То, чего нет в выборке визитов: фото, специализация и адрес мастера.
type MasterExtras = {
  avatarUrl: string | null;
  specialty: string;
  city: string;
  address: string;
  routeUrl: string | null;
};

const emptyExtras: MasterExtras = {
  avatarUrl: null,
  specialty: "",
  city: "",
  address: "",
  routeUrl: null,
};

async function getMasterExtras(profileIds: string[]): Promise<Map<string, MasterExtras>> {
  const extras = new Map<string, MasterExtras>();

  if (profileIds.length === 0) {
    return extras;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, specialty, location_text, address, avatar_url, booking_page_settings")
    .in("id", profileIds);

  // Без этих полей кабинет остаётся рабочим — карточки просто скромнее.
  if (error || !data) {
    return extras;
  }

  for (const row of data) {
    const mapLocation = normalizeBookingPageSettings(row.booking_page_settings).mapLocation;

    extras.set(String(row.id), {
      avatarUrl: resolveAvatar(row.avatar_url ? String(row.avatar_url) : null),
      specialty: String(row.specialty ?? "").trim(),
      city: String(row.location_text ?? "").trim(),
      address: String(row.address ?? "").trim(),
      routeUrl: mapLocation ? buildYandexRouteUrl(mapLocation) : null,
    });
  }

  return extras;
}

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
  // записи, которые он сам подключил ссылкой. Прошедшие визиты, предоплаты,
  // сертификаты и отзывы есть только у того, кто подтвердил номер: по
  // привязке к одной записи истории не собрать.
  //
  // Запросы независимы и идут разом: приложение открывается на этом ответе,
  // и пять последовательных походов в базу были бы видны как задержка.
  const [bookings, past, pendingPayment, certificates, reviews] = identity
    ? await Promise.all([
        getClientBookingsByPhoneHash({ phoneHash: identity.phoneHash }),
        getClientPastBookings({ phoneHash: identity.phoneHash }),
        getClientPendingPayments({ phoneHash: identity.phoneHash }),
        getClientCertificates({ phoneHash: identity.phoneHash }),
        // Отзывы отдаём вместе с визитами: карточка должна сразу показать, что
        // уже оценено, иначе человек оставит второй отзыв на тот же визит.
        getReviewsByAuthor({ authorPhoneHash: identity.phoneHash }),
      ])
    : [
        await getClientBookingsByChat({ telegramUserId: result.user.telegramUserId }),
        [],
        [],
        [],
        [],
      ];

  const [extras, masterProfile] = await Promise.all([
    getMasterExtras([
      ...new Set(
        [...bookings, ...past, ...pendingPayment].map((booking) => booking.profileId),
      ),
    ]),
    // Тот же человек может быть и мастером: чат привязан к кабинету. Тогда
    // приложение предлагает перейти в кабинет.
    getProfileByTelegramChat({ telegramUserId: result.user.telegramUserId }),
  ]);
  const toBooking = (booking: Parameters<typeof toMiniAppBooking>[0]) =>
    toMiniAppBooking(booking, extras.get(booking.profileId) ?? emptyExtras);

  const upcomingCards = await Promise.all(bookings.map(toBooking));
  const pastCards = await Promise.all(past.map(toBooking));

  return NextResponse.json(
    {
      ok: true,
      firstName: result.user.firstName,
      hasIdentity: Boolean(identity),
      master: masterProfile
        ? { name: masterProfile.fullName, username: masterProfile.username }
        : null,
      bookings: upcomingCards,
      past: pastCards,
      myMasters: buildMyMasters(upcomingCards, pastCards),
      certificates,
      reviews: reviews.map((review) => ({
        bookingId: review.bookingId,
        rating: review.rating,
        comment: review.comment,
      })),
      pendingPayment: await Promise.all(
        pendingPayment.map(async (booking) => ({
          ...(await toBooking(booking)),
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
}, extras: MasterExtras): Promise<MiniAppBooking> {
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
    dayLabel: startsAt.setLocale("ru").toFormat("d MMMM"),
    weekdayLabel: startsAt.setLocale("ru").toFormat("cccc"),
    timeLabel: startsAt.toFormat("HH:mm"),
    relativeLabel: formatRelativeDay(startsAt),
    cancelUrl: booking.cancellationToken ? `/cancel/${booking.cancellationToken}` : null,
    masterAvatarUrl: extras.avatarUrl,
    masterSpecialty: extras.specialty,
    city: extras.city,
    address: extras.address,
    routeUrl: extras.routeUrl,
  };
}

// «Сегодня», «Завтра», «Через 5 дней», «3 дня назад» — по календарным дням в
// поясе мастера, а не по суткам: визит завтра в 9:00 — это «завтра», даже
// если до него 10 часов.
function formatRelativeDay(startsAt: DateTime) {
  const today = DateTime.now().setZone(startsAt.zoneName ?? "utc").startOf("day");
  const days = Math.round(startsAt.startOf("day").diff(today, "days").days);

  if (days === 0) return "Сегодня";
  if (days === 1) return "Завтра";
  if (days === -1) return "Вчера";

  const count = Math.abs(days);
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "день"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "дня"
        : "дней";

  return days > 0 ? `Через ${count} ${word}` : `${count} ${word} назад`;
}

type MyMaster = {
  username: string;
  name: string;
  specialty: string;
  avatarUrl: string | null;
  url: string;
  // Последняя услуга у этого мастера: «записаться снова» ведёт сразу на неё.
  lastServiceTitle: string;
  repeatUrl: string;
  visits: number;
};

const myMastersLimit = 8;

// «Мои мастера» — все, у кого человек был или к кому записан. Порядок как у
// визитов: сначала прошедшие от свежих к давним, затем те, к кому запись
// только предстоит. Отдельной таблицы избранного нет намеренно: список
// собирается сам и не требует от человека ничего настраивать.
function buildMyMasters(upcoming: MiniAppBooking[], past: MiniAppBooking[]): MyMaster[] {
  const masters = new Map<string, MyMaster>();

  for (const booking of [...past, ...upcoming]) {
    const known = masters.get(booking.masterUsername);

    if (known) {
      known.visits += 1;
      continue;
    }

    masters.set(booking.masterUsername, {
      username: booking.masterUsername,
      name: booking.masterName,
      specialty: booking.masterSpecialty,
      avatarUrl: booking.masterAvatarUrl,
      url: booking.masterUrl,
      lastServiceTitle: booking.serviceTitle,
      repeatUrl: booking.repeatUrl,
      visits: 1,
    });
  }

  return [...masters.values()].slice(0, myMastersLimit);
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
