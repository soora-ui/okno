import { DateTime } from "luxon";
import { isoToMillis } from "@/lib/iso-millis";
import type {
  AvailabilityRule,
  BlockedSlot,
  Booking,
  BookingSlot,
  Profile,
  Service,
} from "@/lib/mock-data";

type Interval = { start: number; end: number };

const MINUTE_MS = 60_000;

function formatLocalTime(ms: number, fixedOffsetMinutes: number | null, timezone: string) {
  if (fixedOffsetMinutes === null) {
    return DateTime.fromMillis(ms, { zone: timezone }).toFormat("HH:mm");
  }

  const local = new Date(ms + fixedOffsetMinutes * MINUTE_MS);
  const hours = String(local.getUTCHours()).padStart(2, "0");
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
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
  //
  // Интервалы занятости разбираем один раз и сравниваем числами: раньше на
  // каждый слот заново разбирались даты всех записей мастера, и страница
  // мастера с парой сотен записей считалась десятки секунд, а сервер всё это
  // время не отвечал никому. Закончившиеся записи будущий слот не задевают.
  const nowMs = now.toMillis();
  const busyIntervals: Interval[] = bookings
    .filter((booking) => booking.status === "confirmed" || booking.status === "pending_payment")
    .map((booking) => ({
      start: isoToMillis(booking.startsAt),
      end: isoToMillis(booking.busyUntil || booking.endsAt),
    }))
    .filter((interval) => interval.end > nowMs);
  const blockedIntervals: Interval[] = blockedSlots
    .map((slot) => ({ start: isoToMillis(slot.startsAt), end: isoToMillis(slot.endsAt) }))
    .filter((interval) => interval.end > nowMs);
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

    // Сетка слотов считается в миллисекундах: plus() у luxon в поясе мастера
    // на каждый слот ходит в Intl за смещением, и этот цикл съедал две трети
    // CPU рендера страницы мастера (нагрузочный тест 2026-10-31). Минуты
    // luxon прибавляет к абсолютному времени, так что результат тот же.
    const intervalMs = profile.slotIntervalMinutes * MINUTE_MS;
    const durationMs = service.durationMinutes * MINUTE_MS;
    // Перерыв — у каждой услуги свой: новая запись занимает время до конца
    // своего перерыва, а уже сделанная — до своего busy_until (там перерыв
    // её услуги, зафиксированный на момент записи).
    const busyMs = durationMs + Math.max(0, service.bufferMinutes) * MINUTE_MS;
    const lastPossibleStartMs = endOfDay.toMillis() - durationMs;
    // Смещение пояса для подписи «HH:mm» одно на весь рабочий день, если
    // внутри него нет перевода часов; в день перевода спрашиваем luxon.
    const fixedOffset =
      startOfDay.offset === endOfDay.offset ? startOfDay.offset : null;

    const times: string[] = [];

    if (intervalMs <= 0) continue;

    for (
      let slotStartMs = startOfDay.toMillis();
      slotStartMs <= lastPossibleStartMs;
      slotStartMs += intervalMs
    ) {
      if (slotStartMs < nowMs) continue;

      const slotBusyEndMs = slotStartMs + busyMs;
      const intersects = (interval: Interval) =>
        slotStartMs < interval.end && slotBusyEndMs > interval.start;

      if (busyIntervals.some(intersects) || blockedIntervals.some(intersects)) continue;

      times.push(formatLocalTime(slotStartMs, fixedOffset, profile.timezone));
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
