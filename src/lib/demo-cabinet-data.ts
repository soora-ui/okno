import { DateTime } from "luxon";
import {
  landingDemoProfile,
  landingDemoServices,
} from "@/lib/landing-demo";
import type {
  AvailabilityRule,
  BlockedSlot,
  Booking,
  Client,
  NotificationEvent,
  Profile,
  VisitStatus,
} from "@/lib/mock-data";

/**
 * Данные демо-кабинета для тура (/demo/tour). Тот же мастер и те же услуги,
 * что на публичной демо-странице, а записи считаются от текущего момента —
 * иначе кабинет показывал бы пустой «сегодня» и визиты полугодовой давности.
 * В завтрашних записях есть Марина на 11:30 — та, что записывалась в туре.
 */
export const DEMO_CABINET_PROFILE_ID = "demo-cabinet-master";

type ClientSeed = { name: string; phoneTail: string; notes: string };

const clientSeeds: ClientSeed[] = [
  { name: "Марина Соколова", phoneTail: "99", notes: "Хочет нюд, без дизайна." },
  { name: "Дарья Шевцова", phoneTail: "14", notes: "Любит утренние слоты, чувствительная кожа." },
  { name: "Ольга Литвиненко", phoneTail: "37", notes: "Приходит с дочкой, нужен второй стул." },
  { name: "Ксения Белова", phoneTail: "52", notes: "Просит напоминать о визите за день." },
  { name: "Анна Руденко", phoneTail: "08", notes: "" },
];

// [клиент, услуга, день относительно сегодня, время, комментарий, отметка
// визита]. Прошедшие визиты без отметки считаются состоявшимися.
const bookingSeeds: Array<[number, number, number, string, string, VisitStatus?]> = [
  [2, 1, 0, "13:00", ""],
  [3, 0, 0, "16:30", "Если можно, приду на 10 минут позже."],
  [0, 0, 1, "11:30", "Хочу нюд, без дизайна"],
  [4, 2, 1, "15:00", ""],
  [1, 1, 2, "10:00", ""],
  [2, 0, 4, "12:30", ""],
  // История. Марина ходит раз в три недели и всегда приходит — в туре на
  // ней показываем частоту возврата и оценку «Надёжный».
  [0, 0, -21, "11:00", ""],
  [0, 0, -42, "11:30", ""],
  [0, 2, -63, "12:00", ""],
  [0, 0, -84, "11:00", ""],
  // Ксения — для контраста: неявка и поздняя отмена дают «Бывают пропуски».
  [3, 1, -14, "17:00", ""],
  [3, 0, -35, "16:00", "", "no_show"],
  [3, 1, -56, "17:30", ""],
  [3, 0, -77, "16:30", "", "cancelled_late"],
  [1, 0, -21, "10:00", ""],
  [4, 0, -9, "12:00", ""],
];

export function getDemoCabinetData() {
  const zone = landingDemoProfile.timezone;
  const now = DateTime.now().setZone(zone);
  const iso = (value: DateTime) => value.toUTC().toISO() ?? "";

  const profile: Profile = {
    ...landingDemoProfile,
    id: DEMO_CABINET_PROFILE_ID,
    username: "alina-nails",
    telegramChatId: "@okno_master_bot",
    subscriptionTier: "solo-plus",
    subscriptionUntil: iso(now.plus({ days: 24 })),
    monthlyBookingsUsed: 38,
    joinedAt: iso(now.minus({ months: 5 })),
  };

  const services = landingDemoServices.map((service) => ({
    ...service,
    profileId: profile.id,
  }));

  const bookings: Booking[] = bookingSeeds.map(([clientIndex, serviceIndex, day, time, note, mark], index) => {
    const service = services[serviceIndex];
    const [hour, minute] = time.split(":").map(Number);
    const startsAt = now.startOf("day").plus({ days: day }).set({ hour, minute });
    const isPast = startsAt < now;

    return {
      id: `demo-booking-${index + 1}`,
      profileId: profile.id,
      clientId: `demo-client-${clientIndex + 1}`,
      serviceId: service.id,
      status: "confirmed",
      startsAt: iso(startsAt),
      endsAt: iso(startsAt.plus({ minutes: service.durationMinutes })),
      source: "public_page",
      clientNote: note,
      cancellationToken: `demo-cancel-${index + 1}`,
      cancellationTokenExpiresAt: iso(startsAt.minus({ hours: 2 })),
      createdAt: iso(startsAt.minus({ days: 3 })),
      cancelledAt: null,
      visitStatus: isPast ? (mark ?? "completed") : "pending",
      visitStatusSetAt: isPast ? iso(startsAt.plus({ hours: 3 })) : null,
      prepaymentRequired: false,
    };
  });

  const clients: Client[] = clientSeeds.map((seed, index) => {
    const own = bookings.filter((booking) => booking.clientId === `demo-client-${index + 1}`);
    const last = own
      .filter((booking) => DateTime.fromISO(booking.startsAt) < now)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];

    return {
      id: `demo-client-${index + 1}`,
      profileId: profile.id,
      name: seed.name,
      phoneMasked: `+7 999 ***-**-${seed.phoneTail}`,
      notes: seed.notes,
      createdAt: iso(now.minus({ months: 4 }).plus({ days: index * 9 })),
      lastBookingAt: last?.startsAt ?? own[0]?.startsAt ?? iso(now),
    };
  });

  const availabilityRules: AvailabilityRule[] = [
    [1, "09:00", "18:00"],
    [2, "09:00", "18:00"],
    [3, "09:00", "18:00"],
    [4, "10:00", "19:00"],
    [5, "10:00", "19:00"],
    [6, "10:00", "16:00"],
  ].map(([weekday, startTime, endTime], index) => ({
    id: `demo-av-${index + 1}`,
    profileId: profile.id,
    weekday: weekday as number,
    startTime: startTime as string,
    endTime: endTime as string,
    isActive: true,
  }));

  const blockStart = now.startOf("day").plus({ days: 3 }).set({ hour: 13 });
  const blockedSlots: BlockedSlot[] = [
    {
      id: "demo-block-1",
      profileId: profile.id,
      startsAt: iso(blockStart),
      endsAt: iso(blockStart.plus({ hours: 1 })),
      reason: "Перерыв на закупку",
    },
  ];

  const notificationEvents: NotificationEvent[] = [
    {
      id: "demo-notification-1",
      profileId: profile.id,
      type: "telegram_new_booking",
      status: "sent",
      target: "@okno_master_bot",
      createdAt: iso(now.minus({ minutes: 4 })),
    },
    {
      id: "demo-notification-2",
      profileId: profile.id,
      type: "sms_confirmation",
      status: "sent",
      target: "+7 999 ***-**-99",
      createdAt: iso(now.minus({ minutes: 4 })),
    },
  ];

  return {
    profile,
    services,
    bookings,
    clients,
    availabilityRules,
    blockedSlots,
    notificationEvents,
  };
}
