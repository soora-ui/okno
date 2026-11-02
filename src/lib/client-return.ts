import { DateTime } from "luxon";
import { isoToMillis } from "@/lib/iso-millis";

// «Давно не был»: пора ли напомнить клиенту о себе.
//
// Ориентир — срок повтора услуги, который мастер задал в её настройках: он
// точнее любой статистики, потому что мастер знает, сколько держится
// маникюр или окрашивание. Если срока нет, берём среднюю частоту визитов
// самого клиента, а совсем без данных — 90 дней: раньше этого «давно»
// звучит навязчиво.

export type ClientReturnInput = {
  // Прошедшие состоявшиеся визиты, любой порядок.
  pastVisits: Array<{ startsAtIso: string; serviceId: string }>;
  hasUpcomingVisit: boolean;
  services: Array<{ id: string; title: string; repeatIntervalDays: number | null }>;
  timezone: string;
  now?: DateTime;
};

export type ClientReturnAssessment = {
  status: "due" | "ok" | "unknown";
  daysSinceLastVisit: number | null;
  expectedIntervalDays: number | null;
  lastServiceTitle: string | null;
  lastVisitIso: string | null;
};

const defaultReturnIntervalDays = 90;

// Срок повтора — ориентир, а не дедлайн: клиент, пришедший на неделю позже
// обычного, ещё не «пропал». Запас в четверть срока отделяет обычную
// задержку от той, где напоминание уместно.
const overdueGraceRatio = 1.25;

const DAY_MS = 86_400_000;

// Разница в календарных днях у luxon (diff в «days») на каждый шаг ходит в
// Intl за смещением пояса, а аналитика считает её для всей базы клиентов.
// Пока смещение пояса не меняется, календарный день — ровно сутки, и
// разница сводится к делению миллисекунд. Постоянство проверяем по первому
// числу каждого месяца; ответ на «пояс + год» живёт до перезапуска.
const steadyOffsetByZoneYear = new Map<string, number | null>();

function steadyYearOffset(zone: string, year: number) {
  const key = `${zone}:${year}`;
  const cached = steadyOffsetByZoneYear.get(key);
  if (cached !== undefined) return cached;

  let offset: number | null = DateTime.fromObject({ year, month: 1, day: 1 }, { zone }).offset;
  for (let month = 2; month <= 13 && offset !== null; month += 1) {
    const sample = month === 13
      ? DateTime.fromObject({ year: year + 1, month: 1, day: 1 }, { zone })
      : DateTime.fromObject({ year, month, day: 1 }, { zone });
    // У невалидного пояса смещение NaN — оно не равно само себе.
    if (sample.offset !== offset) offset = null;
  }

  steadyOffsetByZoneYear.set(key, offset);
  return offset;
}

function hasSteadyOffset(zone: string, fromMs: number, toMs: number) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return false;

  // Местный год момента — его год по UTC или соседний.
  const fromYear = new Date(fromMs).getUTCFullYear() - 1;
  const toYear = new Date(toMs).getUTCFullYear() + 1;
  if (toYear - fromYear > 50) return false;

  const offset = steadyYearOffset(zone, fromYear);
  if (offset === null) return false;
  for (let year = fromYear + 1; year <= toYear; year += 1) {
    if (steadyYearOffset(zone, year) !== offset) return false;
  }

  return true;
}

export function assessClientReturn(input: ClientReturnInput): ClientReturnAssessment {
  const now = input.now ?? DateTime.now().setZone(input.timezone);
  // Сортируем по числам, а DateTime в поясе клиента строим только там, где
  // нужен счёт календарных дней: аналитика оценивает так всю базу клиентов.
  const visits = [...input.pastVisits]
    .map((visit) => ({ ...visit, startsAtMs: isoToMillis(visit.startsAtIso) }))
    .sort((left, right) => right.startsAtMs - left.startsAtMs);
  const toZoned = (startsAtMs: number) =>
    DateTime.fromMillis(startsAtMs, { zone: "utc" }).setZone(input.timezone);

  const lastVisit = visits[0] ?? null;

  if (!lastVisit) {
    return {
      status: "unknown",
      daysSinceLastVisit: null,
      expectedIntervalDays: null,
      lastServiceTitle: null,
      lastVisitIso: null,
    };
  }

  const lastService = input.services.find((service) => service.id === lastVisit.serviceId) ?? null;
  const lastVisitAt = toZoned(lastVisit.startsAtMs);
  const nowMs = now.toMillis();
  const firstVisitMs = visits[visits.length - 1].startsAtMs;
  const steady =
    now.zoneName === input.timezone &&
    hasSteadyOffset(input.timezone, Math.min(firstVisitMs, nowMs), Math.max(lastVisit.startsAtMs, nowMs));
  const daysSinceLastVisit = Math.max(
    0,
    Math.floor(
      steady ? (nowMs - lastVisit.startsAtMs) / DAY_MS : now.diff(lastVisitAt, "days").days,
    ),
  );
  const expectedIntervalDays = resolveExpectedInterval({
    serviceIntervalDays: lastService?.repeatIntervalDays ?? null,
    visitDaysBetween: () => {
      const ascending = [...visits].reverse();
      return steady
        ? ascending.slice(1).map((visit, index) => (visit.startsAtMs - ascending[index].startsAtMs) / DAY_MS)
        : visitDayGaps(ascending.map((visit) => toZoned(visit.startsAtMs)));
    },
  });

  const threshold = Math.round(
    (expectedIntervalDays ?? defaultReturnIntervalDays) * overdueGraceRatio,
  );

  return {
    status: input.hasUpcomingVisit ? "ok" : daysSinceLastVisit >= threshold ? "due" : "ok",
    daysSinceLastVisit,
    expectedIntervalDays,
    lastServiceTitle: lastService?.title ?? null,
    lastVisitIso: lastVisitAt.toUTC().toISO(),
  };
}

function visitDayGaps(sorted: DateTime[]) {
  return sorted.slice(1).map((date, index) => date.diff(sorted[index], "days").days);
}

function resolveExpectedInterval(input: {
  serviceIntervalDays: number | null;
  // Промежутки между визитами в днях, по возрастанию дат. Нужны, только
  // если у услуги нет срока повтора.
  visitDaysBetween: () => number[];
}) {
  if (input.serviceIntervalDays && input.serviceIntervalDays > 0) {
    return input.serviceIntervalDays;
  }

  const gaps = input.visitDaysBetween().map((days) => Math.max(1, Math.round(days)));

  if (gaps.length === 0) {
    return null;
  }

  return Math.max(1, Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length));
}

export function formatDaysAgo(days: number) {
  const mod10 = days % 10;
  const mod100 = days % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${days} день`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${days} дня`;
  }

  return `${days} дней`;
}
