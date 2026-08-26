import { DateTime } from "luxon";
import type {
  AvailabilityRule,
  BlockedSlot,
  Booking,
  BookingSlot,
  Profile,
  Service,
} from "@/lib/mock-data";

function overlaps(
  startA: DateTime,
  endA: DateTime,
  startB: DateTime,
  endB: DateTime,
) {
  return startA < endB && endA > startB;
}

export function buildBookingSlotsForService(input: {
  profile: Profile;
  service: Service;
  availabilityRules: AvailabilityRule[];
  blockedSlots: BlockedSlot[];
  bookings: Booking[];
  maxDaysToShow?: number;
  /**
   * С какой даты начинать выдачу (ISO, `2026-08-30`). По умолчанию — с
   * сегодняшнего дня.
   *
   * Нужно консультанту, который предлагает записаться повторно: срок бывает
   * и месяц, а maxDaysToShow считает дни СО СЛОТАМИ, не календарные. У
   * мастера, работающего каждый день, выдача заканчивается через две недели —
   * и нужный день в неё не попадает, хотя в окне записи мастера он есть.
   *
   * Окно записи (bookingWindowDays) при этом не растягивается: смещается
   * начало отсчёта, а не граница.
   */
  fromDate?: string;
}) {
  const {
    profile,
    service,
    availabilityRules,
    blockedSlots,
    bookings,
    maxDaysToShow = 14,
    fromDate,
  } = input;

  const now = DateTime.now().setZone(profile.timezone);

  // Отсчёт всегда ведётся от сегодняшнего дня — иначе окно записи мастера
  // можно было бы обойти, попросив слоты от даты в будущем.
  const requestedStart = fromDate
    ? DateTime.fromISO(fromDate, { zone: profile.timezone }).startOf("day")
    : null;
  const startOffset =
    requestedStart?.isValid && requestedStart > now.startOf("day")
      ? Math.floor(requestedStart.diff(now.startOf("day"), "days").days)
      : 0;
  // pending_payment — слот резервирован под предоплату (Модуль 2,
  // okno-tz-rating-prepayment.md, ТЗ 2.3): пока клиент не оплатил или не
  // истекли 15 минут резервации, слот не должен казаться свободным другим
  // клиентам, иначе получаем двойную запись на один и тот же слот.
  const futureBookings = bookings.filter(
    (booking) => booking.status === "confirmed" || booking.status === "pending_payment",
  );
  const visibleDays: BookingSlot[] = [];

  for (
    let dayOffset = startOffset;
    dayOffset < profile.bookingWindowDays && visibleDays.length < maxDaysToShow;
    dayOffset += 1
  ) {
    const day = now.startOf("day").plus({ days: dayOffset });
    const rule = availabilityRules.find(
      (item) => item.isActive && item.weekday === day.weekday,
    );

    if (!rule) continue;

    const startOfDay = DateTime.fromISO(`${day.toISODate()}T${rule.startTime}`, {
      zone: profile.timezone,
    });
    const endOfDay = DateTime.fromISO(`${day.toISODate()}T${rule.endTime}`, {
      zone: profile.timezone,
    });

    if (!startOfDay.isValid || !endOfDay.isValid || endOfDay <= startOfDay) continue;

    const lastPossibleStart = endOfDay.minus({
      minutes: service.durationMinutes,
    });

    const times: string[] = [];

    for (
      let slotStart = startOfDay;
      slotStart <= lastPossibleStart;
      slotStart = slotStart.plus({ minutes: profile.slotIntervalMinutes })
    ) {
      if (slotStart < now) continue;

      const slotEnd = slotStart.plus({ minutes: service.durationMinutes });
      const slotBusyEnd = slotEnd.plus({ minutes: profile.bufferMinutes });

      const intersectsBooking = futureBookings.some((booking) => {
        const bookingStart = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
          profile.timezone,
        );
        const bookingBusyEnd = DateTime.fromISO(booking.endsAt, { zone: "utc" })
          .setZone(profile.timezone)
          .plus({ minutes: profile.bufferMinutes });

        return overlaps(slotStart, slotBusyEnd, bookingStart, bookingBusyEnd);
      });

      if (intersectsBooking) continue;

      const intersectsBlockedSlot = blockedSlots.some((blockedSlot) => {
        const blockedStart = DateTime.fromISO(blockedSlot.startsAt, {
          zone: "utc",
        }).setZone(profile.timezone);
        const blockedEnd = DateTime.fromISO(blockedSlot.endsAt, { zone: "utc" }).setZone(
          profile.timezone,
        );

        return overlaps(slotStart, slotBusyEnd, blockedStart, blockedEnd);
      });

      if (intersectsBlockedSlot) continue;

      times.push(slotStart.toFormat("HH:mm"));
    }

    if (times.length > 0) {
      visibleDays.push({
        // MMMM, а не LLLL: LLLL даёт именительный падеж («17 август»), а с
        // числом нужен родительный — «17 августа».
        date: day.setLocale("ru").toFormat("d MMMM"),
        value: day.toISODate() ?? "",
        times,
      });
    }
  }

  return visibleDays;
}
