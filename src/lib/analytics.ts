import { DateTime } from "luxon";
import { assessClientReturn } from "@/lib/client-return";
import type {
  AvailabilityRule,
  BlockedSlot,
  Booking,
  Client,
  Service,
  VisitStatus,
} from "@/lib/mock-data";

// Аналитика мастера, которую не нужно заполнять: всё считается из записей,
// услуг и графика работы, которые уже есть в кабинете.
//
// Деньги считаются по цене на момент записи (bookings.price). У записей без
// снимка — по текущей цене услуги.

export type AnalyticsPeriodId = "month" | "prev-month" | "90d";

export const analyticsPeriods: Array<{ id: AnalyticsPeriodId; label: string }> = [
  { id: "month", label: "Этот месяц" },
  { id: "prev-month", label: "Прошлый месяц" },
  { id: "90d", label: "90 дней" },
];

export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriodId {
  return analyticsPeriods.some((period) => period.id === value)
    ? (value as AnalyticsPeriodId)
    : "month";
}

export type AnalyticsInput = {
  bookings: Booking[];
  services: Service[];
  clients: Client[];
  availabilityRules: AvailabilityRule[];
  blockedSlots: BlockedSlot[];
  timezone: string;
  period: AnalyticsPeriodId;
  now?: DateTime;
};

export type MetricWithChange = {
  value: number;
  previous: number;
  // В процентах; null — сравнивать не с чем (в прошлом периоде был ноль).
  changePct: number | null;
};

export type AnalyticsChartBucket = {
  key: string;
  label: string;
  revenue: number;
  // Будущая часть периода: здесь не заработанное, а уже записанное.
  isFuture: boolean;
};

export type AnalyticsServiceRow = {
  serviceId: string;
  title: string;
  visits: number;
  revenue: number;
  // Время, которое визиты заняли в графике, вместе с перерывом после них.
  busyMinutes: number;
  revenuePerHour: number | null;
};

export type LoadMinutes = { available: number; booked: number };

export type AnalyticsReport = {
  period: {
    id: AnalyticsPeriodId;
    label: string;
    rangeLabel: string;
    compareLabel: string;
  };
  hasData: boolean;
  revenue: MetricWithChange & { expected: number };
  visits: MetricWithChange;
  averageCheck: MetricWithChange;
  load: {
    // Доля рабочего времени, занятая визитами, за прошедшую часть периода.
    pastPct: number | null;
    // Сколько оставшегося рабочего времени уже занято записями.
    aheadPct: number | null;
    byWeekday: Array<{ weekday: number; label: string; pct: number | null }>;
    // Минуты, из которых посчитаны проценты: по ним складывается загрузка
    // команды (средний процент мастеров врал бы при разных графиках).
    minutes: {
      past: LoadMinutes;
      ahead: LoadMinutes | null;
      byWeekday: LoadMinutes[];
    };
  };
  chart: AnalyticsChartBucket[];
  services: AnalyticsServiceRow[];
  clients: {
    total: number;
    newCount: number;
    returningCount: number;
    returningPct: number | null;
    dueForReturn: number;
  };
  losses: {
    noShowCount: number;
    noShowAmount: number;
    lateCancelCount: number;
    lateCancelAmount: number;
  };
};

const NOT_ATTENDED: ReadonlySet<VisitStatus> = new Set([
  "no_show",
  "cancelled_late",
  "cancelled_ok",
]);

// Время, освобождённое отменой, снова можно продать — в загрузку не идёт.
// Неявка — идёт: окно было занято и пропало.
const FREED_SLOT: ReadonlySet<VisitStatus> = new Set(["cancelled_late", "cancelled_ok"]);

const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type Interval = { start: number; end: number };

type PreparedBooking = {
  booking: Booking;
  start: DateTime;
  startMs: number;
  endMs: number;
  busyEndMs: number;
  price: number;
};

function isAttended(booking: Booking) {
  return booking.status === "confirmed" && !NOT_ATTENDED.has(booking.visitStatus);
}

function occupiesTime(booking: Booking) {
  return booking.status === "confirmed" && !FREED_SLOT.has(booking.visitStatus);
}

function changePct(value: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((value - previous) / previous) * 100);
}

function metric(value: number, previous: number): MetricWithChange {
  return { value, previous, changePct: changePct(value, previous) };
}

// Ручная запись вне графика может дать больше 100% — показываем потолок.
function toLoadPct(minutes: LoadMinutes) {
  return minutes.available > 0
    ? Math.min(100, Math.round((minutes.booked / minutes.available) * 100))
    : null;
}

function overlapMinutes(a: Interval, b: Interval) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / 60000;
}

function mergeIntervals(intervals: Interval[]) {
  const sorted = [...intervals].sort((left, right) => left.start - right.start);
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
}

function resolveRange(period: AnalyticsPeriodId, now: DateTime) {
  if (period === "prev-month") {
    const start = now.startOf("month").minus({ months: 1 });
    const end = start.plus({ months: 1 });
    return { start, end, compareStart: start.minus({ months: 1 }), compareEnd: start };
  }

  if (period === "90d") {
    const end = now.startOf("day").plus({ days: 1 });
    const start = end.minus({ days: 90 });
    return { start, end, compareStart: start.minus({ days: 90 }), compareEnd: start };
  }

  // Текущий месяц сравниваем с тем же числом дней прошлого месяца: иначе
  // полмесяца всегда проигрывают целому месяцу.
  const start = now.startOf("month");
  const end = start.plus({ months: 1 });
  const compareStart = start.minus({ months: 1 });
  const elapsed = now.diff(start);
  const compareEnd = DateTime.min(compareStart.plus(elapsed), start);
  return { start, end, compareStart, compareEnd };
}

function formatRange(start: DateTime, end: DateTime) {
  const last = end.minus({ days: 1 });
  const from = start.setLocale("ru");
  const to = last.setLocale("ru");

  if (from.hasSame(to, "month")) {
    return `${from.toFormat("d")}–${to.toFormat("d MMMM yyyy")}`;
  }

  return `${from.toFormat("d MMMM")} – ${to.toFormat("d MMMM yyyy")}`;
}

function byRevenuePerHour(left: AnalyticsServiceRow, right: AnalyticsServiceRow) {
  return (right.revenuePerHour ?? -1) - (left.revenuePerHour ?? -1) || right.revenue - left.revenue;
}

export function buildAnalyticsReport(input: AnalyticsInput): AnalyticsReport {
  const zone = input.timezone;
  const now = (input.now ?? DateTime.now()).setZone(zone);
  const nowMs = now.toMillis();
  const range = resolveRange(input.period, now);
  const startMs = range.start.toMillis();
  const endMs = range.end.toMillis();
  const priceById = new Map(input.services.map((service) => [service.id, service.price]));

  const prepared: PreparedBooking[] = input.bookings.map((booking) => {
    const start = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(zone);
    const endMsValue = DateTime.fromISO(booking.endsAt, { zone: "utc" }).toMillis();
    const busyEnd = DateTime.fromISO(booking.busyUntil || booking.endsAt, { zone: "utc" });

    return {
      booking,
      start,
      startMs: start.toMillis(),
      endMs: endMsValue,
      busyEndMs: busyEnd.isValid ? Math.max(busyEnd.toMillis(), endMsValue) : endMsValue,
      price: booking.price ?? priceById.get(booking.serviceId) ?? 0,
    };
  });

  const inWindow = (item: PreparedBooking, from: number, to: number) =>
    item.startMs >= from && item.startMs < to;

  // Состоявшиеся — только в прошлом: будущая запись ещё может не случиться.
  const pastEnd = Math.min(endMs, nowMs);
  const doneVisits = prepared.filter(
    (item) => isAttended(item.booking) && inWindow(item, startMs, pastEnd),
  );
  const upcomingVisits = prepared.filter(
    (item) =>
      item.booking.status === "confirmed" &&
      item.booking.visitStatus === "pending" &&
      inWindow(item, Math.max(startMs, nowMs), endMs),
  );
  const compareEndMs = Math.min(range.compareEnd.toMillis(), nowMs);
  const compareVisits = prepared.filter(
    (item) =>
      isAttended(item.booking) && inWindow(item, range.compareStart.toMillis(), compareEndMs),
  );

  const sumPrice = (items: PreparedBooking[]) =>
    items.reduce((total, item) => total + item.price, 0);
  const revenueDone = sumPrice(doneVisits);
  const revenuePrevious = sumPrice(compareVisits);
  const averageCheck = doneVisits.length > 0 ? Math.round(revenueDone / doneVisits.length) : 0;
  const averagePrevious =
    compareVisits.length > 0 ? Math.round(revenuePrevious / compareVisits.length) : 0;

  // Загрузка: рабочие окна по графику минус блокировки, против времени,
  // занятого визитами вместе с перерывами.
  const blocked = mergeIntervals(
    input.blockedSlots.map((slot) => ({
      start: DateTime.fromISO(slot.startsAt, { zone: "utc" }).toMillis(),
      end: DateTime.fromISO(slot.endsAt, { zone: "utc" }).toMillis(),
    })),
  );
  const busy = mergeIntervals(
    prepared
      .filter((item) => occupiesTime(item.booking))
      .map((item) => ({ start: item.startMs, end: item.busyEndMs })),
  );

  const workingDays: Array<{ weekday: number; window: Interval }> = [];
  for (let day = range.start.startOf("day"); day < range.end; day = day.plus({ days: 1 })) {
    const rule = input.availabilityRules.find(
      (item) => item.isActive && item.weekday === day.weekday,
    );
    if (!rule) continue;

    const date = day.toISODate();
    const open = DateTime.fromISO(`${date}T${rule.startTime}`, { zone });
    const close = DateTime.fromISO(`${date}T${rule.endTime}`, { zone });
    if (!open.isValid || !close.isValid || close <= open) continue;

    workingDays.push({
      weekday: day.weekday,
      window: { start: open.toMillis(), end: close.toMillis() },
    });
  }

  const measureLoad = (from: number, to: number, weekday?: number): LoadMinutes => {
    let available = 0;
    let booked = 0;

    for (const day of workingDays) {
      if (weekday !== undefined && day.weekday !== weekday) continue;
      const window = {
        start: Math.max(day.window.start, from),
        end: Math.min(day.window.end, to),
      };
      if (window.end <= window.start) continue;

      const blockedMinutes = blocked.reduce(
        (total, interval) => total + overlapMinutes(window, interval),
        0,
      );
      available += (window.end - window.start) / 60000 - blockedMinutes;
      booked += busy.reduce(
        (total, interval) => total + overlapMinutes(window, interval),
        0,
      );
    }

    return { available, booked };
  };

  const loadPast = measureLoad(startMs, pastEnd);
  const loadAhead = nowMs < endMs ? measureLoad(Math.max(startMs, nowMs), endMs) : null;
  const byWeekdayMinutes = weekdayLabels.map((_, index) => measureLoad(startMs, pastEnd, index + 1));
  const byWeekday = weekdayLabels.map((label, index) => ({
    weekday: index + 1,
    label,
    pct: toLoadPct(byWeekdayMinutes[index]),
  }));

  // График выручки: по дням для месяца, по неделям для 90 дней.
  const chart: AnalyticsChartBucket[] = [];
  const bucketUnit = input.period === "90d" ? "week" : "day";
  for (
    let cursor = range.start.startOf(bucketUnit);
    cursor < range.end;
    cursor = cursor.plus(bucketUnit === "week" ? { weeks: 1 } : { days: 1 })
  ) {
    const from = Math.max(cursor.toMillis(), startMs);
    const to = Math.min(cursor.plus(bucketUnit === "week" ? { weeks: 1 } : { days: 1 }).toMillis(), endMs);
    const isFuture = from >= nowMs;
    const items = isFuture
      ? upcomingVisits.filter((item) => inWindow(item, from, to))
      : doneVisits.filter((item) => inWindow(item, from, to));

    chart.push({
      key: cursor.toISODate() ?? String(from),
      label:
        bucketUnit === "week"
          ? cursor.setLocale("ru").toFormat("d MMM")
          : cursor.toFormat("d"),
      revenue: sumPrice(items),
      isFuture,
    });
  }

  // Услуги: сколько приносит час работы, с учётом перерыва после визита —
  // это время тоже нельзя продать другому клиенту.
  const serviceStats = new Map<string, AnalyticsServiceRow>();
  for (const item of doneVisits) {
    const service = input.services.find((entry) => entry.id === item.booking.serviceId);
    const row = serviceStats.get(item.booking.serviceId) ?? {
      serviceId: item.booking.serviceId,
      title: service?.title ?? "Удалённая услуга",
      visits: 0,
      revenue: 0,
      busyMinutes: 0,
      revenuePerHour: null,
    };
    row.visits += 1;
    row.revenue += item.price;
    row.busyMinutes += Math.max(0, (item.busyEndMs - item.startMs) / 60000);
    serviceStats.set(item.booking.serviceId, row);
  }
  const services = [...serviceStats.values()]
    .map((row) => ({
      ...row,
      busyMinutes: Math.round(row.busyMinutes),
      revenuePerHour:
        row.busyMinutes > 0 ? Math.round(row.revenue / (row.busyMinutes / 60)) : null,
    }))
    .sort(byRevenuePerHour);

  // Клиенты: новый — тот, чей первый состоявшийся визит попал в период.
  const firstVisitByClient = new Map<string, number>();
  for (const item of prepared) {
    if (!isAttended(item.booking) || item.startMs >= nowMs) continue;
    const current = firstVisitByClient.get(item.booking.clientId);
    if (current === undefined || item.startMs < current) {
      firstVisitByClient.set(item.booking.clientId, item.startMs);
    }
  }
  const periodClients = new Set(doneVisits.map((item) => item.booking.clientId));
  let newCount = 0;
  for (const clientId of periodClients) {
    const first = firstVisitByClient.get(clientId);
    if (first !== undefined && first >= startMs) newCount += 1;
  }
  const returningCount = periodClients.size - newCount;

  // «Давно не были» — та же оценка, что в разделе «Клиенты».
  let dueForReturn = 0;
  for (const client of input.clients) {
    const own = prepared.filter((item) => item.booking.clientId === client.id);
    const assessment = assessClientReturn({
      pastVisits: own
        .filter((item) => isAttended(item.booking) && item.startMs <= nowMs)
        .map((item) => ({ startsAtIso: item.booking.startsAt, serviceId: item.booking.serviceId })),
      hasUpcomingVisit: own.some(
        (item) => isAttended(item.booking) && item.startMs > nowMs,
      ),
      services: input.services,
      timezone: zone,
      now,
    });
    if (assessment.status === "due") dueForReturn += 1;
  }

  const periodMarked = prepared.filter(
    (item) => item.booking.status === "confirmed" && inWindow(item, startMs, pastEnd),
  );
  const noShows = periodMarked.filter((item) => item.booking.visitStatus === "no_show");
  const lateCancels = periodMarked.filter(
    (item) => item.booking.visitStatus === "cancelled_late",
  );

  const periodLabel =
    analyticsPeriods.find((period) => period.id === input.period)?.label ?? "";
  const compareLabel =
    input.period === "month"
      ? "к тем же дням прошлого месяца"
      : input.period === "prev-month"
        ? "к позапрошлому месяцу"
        : "к предыдущим 90 дням";

  return {
    period: {
      id: input.period,
      label: periodLabel,
      rangeLabel: formatRange(range.start, range.end),
      compareLabel,
    },
    hasData: doneVisits.length > 0 || upcomingVisits.length > 0 || compareVisits.length > 0,
    revenue: { ...metric(revenueDone, revenuePrevious), expected: sumPrice(upcomingVisits) },
    visits: metric(doneVisits.length, compareVisits.length),
    averageCheck: metric(averageCheck, averagePrevious),
    load: {
      pastPct: toLoadPct(loadPast),
      aheadPct: loadAhead ? toLoadPct(loadAhead) : null,
      byWeekday,
      minutes: { past: loadPast, ahead: loadAhead, byWeekday: byWeekdayMinutes },
    },
    chart,
    services,
    clients: {
      total: periodClients.size,
      newCount,
      returningCount,
      returningPct:
        periodClients.size > 0 ? Math.round((returningCount / periodClients.size) * 100) : null,
      dueForReturn,
    },
    losses: {
      noShowCount: noShows.length,
      noShowAmount: sumPrice(noShows),
      lateCancelCount: lateCancels.length,
      lateCancelAmount: sumPrice(lateCancels),
    },
  };
}

// Общая картина студии: отчёты мастеров за один и тот же период, сложенные.
// Средний чек и проценты считаются заново из сумм, а не усредняются.
// Клиент, который ходит к двум мастерам, считается у каждого: база клиентов
// у мастеров своя.
export function mergeAnalyticsReports(
  parts: Array<{ name: string; report: AnalyticsReport }>,
): AnalyticsReport {
  const reports = parts.map((part) => part.report);
  const [first] = reports;
  const total = (pick: (report: AnalyticsReport) => number) =>
    reports.reduce((sum, report) => sum + pick(report), 0);
  const addMinutes = (items: Array<LoadMinutes | null>) =>
    items.reduce<LoadMinutes | null>(
      (sum, item) =>
        item
          ? { available: (sum?.available ?? 0) + item.available, booked: (sum?.booked ?? 0) + item.booked }
          : sum,
      null,
    );

  const revenue = total((report) => report.revenue.value);
  const revenuePrevious = total((report) => report.revenue.previous);
  const visits = total((report) => report.visits.value);
  const visitsPrevious = total((report) => report.visits.previous);

  const past = addMinutes(reports.map((report) => report.load.minutes.past)) ?? { available: 0, booked: 0 };
  const ahead = addMinutes(reports.map((report) => report.load.minutes.ahead));
  const byWeekdayMinutes = first.load.byWeekday.map(
    (_, index) =>
      addMinutes(reports.map((report) => report.load.minutes.byWeekday[index] ?? null)) ?? {
        available: 0,
        booked: 0,
      },
  );

  const chart = new Map<string, AnalyticsChartBucket>();
  for (const report of reports) {
    for (const bucket of report.chart) {
      const existing = chart.get(bucket.key);
      chart.set(bucket.key, existing ? { ...existing, revenue: existing.revenue + bucket.revenue } : { ...bucket });
    }
  }

  const clientsTotal = total((report) => report.clients.total);
  const returningCount = total((report) => report.clients.returningCount);

  return {
    period: first.period,
    hasData: reports.some((report) => report.hasData),
    revenue: { ...metric(revenue, revenuePrevious), expected: total((report) => report.revenue.expected) },
    visits: metric(visits, visitsPrevious),
    averageCheck: metric(
      visits > 0 ? Math.round(revenue / visits) : 0,
      visitsPrevious > 0 ? Math.round(revenuePrevious / visitsPrevious) : 0,
    ),
    load: {
      pastPct: toLoadPct(past),
      aheadPct: ahead ? toLoadPct(ahead) : null,
      byWeekday: first.load.byWeekday.map((day, index) => ({ ...day, pct: toLoadPct(byWeekdayMinutes[index]) })),
      minutes: { past, ahead, byWeekday: byWeekdayMinutes },
    },
    chart: [...chart.values()].sort((left, right) => left.key.localeCompare(right.key)),
    services: parts
      .flatMap(({ name, report }) => report.services.map((row) => ({ ...row, title: `${row.title} · ${name}` })))
      .sort(byRevenuePerHour),
    clients: {
      total: clientsTotal,
      newCount: total((report) => report.clients.newCount),
      returningCount,
      returningPct: clientsTotal > 0 ? Math.round((returningCount / clientsTotal) * 100) : null,
      dueForReturn: total((report) => report.clients.dueForReturn),
    },
    losses: {
      noShowCount: total((report) => report.losses.noShowCount),
      noShowAmount: total((report) => report.losses.noShowAmount),
      lateCancelCount: total((report) => report.losses.lateCancelCount),
      lateCancelAmount: total((report) => report.losses.lateCancelAmount),
    },
  };
}
