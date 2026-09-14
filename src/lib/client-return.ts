import { DateTime } from "luxon";

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

export function assessClientReturn(input: ClientReturnInput): ClientReturnAssessment {
  const now = input.now ?? DateTime.now().setZone(input.timezone);
  const visits = [...input.pastVisits]
    .map((visit) => ({
      ...visit,
      startsAt: DateTime.fromISO(visit.startsAtIso, { zone: "utc" }).setZone(input.timezone),
    }))
    .sort((left, right) => right.startsAt.toMillis() - left.startsAt.toMillis());

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
  const daysSinceLastVisit = Math.max(0, Math.floor(now.diff(lastVisit.startsAt, "days").days));
  const expectedIntervalDays = resolveExpectedInterval({
    serviceIntervalDays: lastService?.repeatIntervalDays ?? null,
    visitDates: visits.map((visit) => visit.startsAt),
  });

  const threshold = Math.round(
    (expectedIntervalDays ?? defaultReturnIntervalDays) * overdueGraceRatio,
  );

  return {
    status: input.hasUpcomingVisit ? "ok" : daysSinceLastVisit >= threshold ? "due" : "ok",
    daysSinceLastVisit,
    expectedIntervalDays,
    lastServiceTitle: lastService?.title ?? null,
    lastVisitIso: lastVisit.startsAt.toUTC().toISO(),
  };
}

function resolveExpectedInterval(input: {
  serviceIntervalDays: number | null;
  visitDates: DateTime[];
}) {
  if (input.serviceIntervalDays && input.serviceIntervalDays > 0) {
    return input.serviceIntervalDays;
  }

  if (input.visitDates.length < 2) {
    return null;
  }

  const sorted = [...input.visitDates].sort((left, right) => left.toMillis() - right.toMillis());
  const gaps = sorted
    .slice(1)
    .map((date, index) => Math.max(1, Math.round(date.diff(sorted[index], "days").days)));

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
