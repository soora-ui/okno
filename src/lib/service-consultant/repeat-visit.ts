import { DateTime } from "luxon";
import type { BookingSlot } from "@/lib/mock-data";
import type { RepeatVisitOffer } from "@/lib/service-consultant/types";

// Расчёт даты повторного визита и подбор свободного времени.
//
// Считает код, а не модель, и по той же причине, по которой это же считается
// для SMS-напоминания: срок повторного визита — объявленная величина услуги
// (services.repeat_interval_days), а не то, что можно вычитать из прозы
// мануала. Если бы бот разбирал срок из текста сам, клиент получал бы от
// сервиса две разные даты — одну в SMS, другую в чате — и обе со ссылкой на
// одного мастера.
//
// Модель в этом исходе не называет ни дней, ни дат, ни времени: её задача —
// только распознать вопрос. Всё остальное здесь.

/** Сколько времени показывать в одном дне. Больше — это уже не подсказка. */
const MAX_TIMES_IN_OFFER = 6;

export function resolveRepeatVisitDate(input: {
  lastVisitIso: string | null;
  repeatIntervalDays: number | null;
  timezone: string;
}): DateTime | null {
  if (!input.lastVisitIso || !input.repeatIntervalDays) {
    return null;
  }

  const lastVisit = DateTime.fromISO(input.lastVisitIso, { zone: "utc" }).setZone(
    input.timezone,
  );

  if (!lastVisit.isValid) {
    return null;
  }

  const earliest = lastVisit.plus({ days: input.repeatIntervalDays }).startOf("day");
  const today = DateTime.now().setZone(input.timezone).startOf("day");

  // Срок мог уже пройти — тогда «не раньше чем» превращается в «сегодня».
  return earliest > today ? earliest : today;
}

/**
 * Первый день со свободным временем не раньше срока. null — расписание до
 * этой даты ещё не открыто: тогда клиент получает просто ответ на вопрос,
 * без предложения записаться. Придумывать время, которого нет, нельзя, а
 * обещать «загляни позже» — то же самое обещание без срока.
 */
export function buildRepeatVisitOffer(input: {
  earliest: DateTime;
  slots: BookingSlot[];
  serviceId: string;
  username: string;
  timezone: string;
}): RepeatVisitOffer | null {
  const day = input.slots.find((slot) => {
    const slotDate = DateTime.fromISO(slot.value, { zone: input.timezone });
    return slotDate.isValid && slotDate.startOf("day") >= input.earliest;
  });

  if (!day || day.times.length === 0) {
    return null;
  }

  return {
    date: day.value,
    dateLabel: day.date,
    times: day.times.slice(0, MAX_TIMES_IN_OFFER),
    serviceId: input.serviceId,
    username: input.username,
  };
}
