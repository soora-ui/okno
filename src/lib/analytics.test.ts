import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { buildAnalyticsReport, mergeAnalyticsReports } from "@/lib/analytics";
import type { AvailabilityRule, Booking, Client, Service, VisitStatus } from "@/lib/mock-data";
import { noServiceDiscounts } from "@/lib/service-discounts";

const zone = "Europe/Moscow";
// Среда, 15 октября 2025, 12:00 — середина месяца.
const now = DateTime.fromISO("2025-10-15T12:00", { zone });

function service(id: string, price: number, durationMinutes: number, bufferMinutes = 0): Service {
  return {
    id,
    profileId: "p",
    title: id,
    description: "",
    durationMinutes,
    price,
    isActive: true,
    sortOrder: 1,
    repeatIntervalDays: null,
    bufferMinutes,
    prepaymentType: "none",
    prepaymentValue: 0,
    ...noServiceDiscounts,
  };
}

let seq = 0;
function booking(
  clientId: string,
  svc: Service,
  startsAtLocal: string,
  visitStatus: VisitStatus = "completed",
): Booking {
  const start = DateTime.fromISO(startsAtLocal, { zone });
  const end = start.plus({ minutes: svc.durationMinutes });
  seq += 1;
  return {
    id: `b${seq}`,
    profileId: "p",
    clientId,
    serviceId: svc.id,
    status: "confirmed",
    startsAt: start.toUTC().toISO() ?? "",
    endsAt: end.toUTC().toISO() ?? "",
    busyUntil: end.plus({ minutes: svc.bufferMinutes }).toUTC().toISO() ?? "",
    source: "public_page",
    clientNote: "",
    cancellationToken: `t${seq}`,
    cancellationTokenExpiresAt: "",
    createdAt: "",
    cancelledAt: null,
    visitStatus,
    visitStatusSetAt: null,
    prepaymentRequired: false,
  };
}

function client(id: string): Client {
  return { id, profileId: "p", name: id, phoneMasked: "", notes: "", createdAt: "", lastBookingAt: "" };
}

// Пн–Пт, 10:00–18:00: 8 часов в день.
const rules: AvailabilityRule[] = [1, 2, 3, 4, 5].map((weekday) => ({
  id: `r${weekday}`,
  profileId: "p",
  weekday,
  startTime: "10:00",
  endTime: "18:00",
  isActive: true,
}));

const manicure = service("manicure", 2000, 150);
const correction = service("correction", 1200, 50, 10);

function report(bookings: Booking[], period: "month" | "prev-month" | "90d" = "month") {
  return buildAnalyticsReport({
    bookings,
    services: [manicure, correction],
    clients: [client("a"), client("b"), client("c")],
    availabilityRules: rules,
    blockedSlots: [],
    timezone: zone,
    period,
    now,
  });
}

describe("buildAnalyticsReport", () => {
  it("выручка — только состоявшиеся визиты, будущие идут в «записано»", () => {
    const result = report([
      booking("a", manicure, "2025-10-06T10:00"),
      booking("b", correction, "2025-10-07T10:00", "no_show"),
      booking("c", manicure, "2025-10-20T10:00", "pending"),
    ]);

    expect(result.revenue.value).toBe(2000);
    expect(result.revenue.expected).toBe(2000);
    expect(result.visits.value).toBe(1);
    expect(result.losses.noShowCount).toBe(1);
    expect(result.losses.noShowAmount).toBe(1200);
  });

  it("текущий месяц сравнивается с теми же днями прошлого", () => {
    const result = report([
      booking("a", manicure, "2025-10-06T10:00"),
      booking("a", manicure, "2025-09-10T10:00"),
      // После 15 сентября — в сравнение не попадает.
      booking("b", manicure, "2025-09-25T10:00"),
    ]);

    expect(result.revenue.previous).toBe(2000);
    expect(result.revenue.changePct).toBe(0);
  });

  it("доход в час учитывает перерыв после услуги", () => {
    const result = report([
      booking("a", manicure, "2025-10-06T10:00"),
      booking("b", correction, "2025-10-07T10:00"),
    ]);

    const [first, second] = result.services;
    // Коррекция: 1200 ₽ за 60 минут с перерывом — выгоднее маникюра.
    expect(first.serviceId).toBe("correction");
    expect(first.revenuePerHour).toBe(1200);
    expect(second.revenuePerHour).toBe(800);
  });

  it("загрузка считается по графику, отменённое время свободно", () => {
    const result = report([
      // 1–14 октября: 10 рабочих дней по 8 часов, плюс 15-е до полудня — 2 часа.
      booking("a", manicure, "2025-10-06T10:00"),
      booking("b", manicure, "2025-10-07T10:00", "cancelled_ok"),
    ]);

    // 150 минут из 82 часов.
    expect(result.load.pastPct).toBe(3);
    expect(result.load.byWeekday[0].pct).toBe(Math.round((150 / (2 * 480)) * 100));
    expect(result.load.byWeekday[5].pct).toBeNull();
  });

  it("новые и постоянные клиенты", () => {
    const result = report([
      booking("a", manicure, "2025-08-01T10:00"),
      booking("a", manicure, "2025-10-06T10:00"),
      booking("b", manicure, "2025-10-08T10:00"),
    ]);

    expect(result.clients.total).toBe(2);
    expect(result.clients.newCount).toBe(1);
    expect(result.clients.returningCount).toBe(1);
    expect(result.clients.returningPct).toBe(50);
  });

  it("выручка — по цене на момент записи, а не по текущей", () => {
    const old = { ...booking("a", manicure, "2025-10-06T10:00"), price: 1500 };
    const result = report([old, booking("b", manicure, "2025-10-07T10:00")]);

    expect(result.revenue.value).toBe(3500);
    expect(result.services[0].revenue).toBe(3500);
  });

  it("без записей нет данных и деления на ноль", () => {
    const result = report([]);

    expect(result.hasData).toBe(false);
    expect(result.averageCheck.value).toBe(0);
    expect(result.revenue.changePct).toBeNull();
    expect(result.load.pastPct).toBe(0);
  });
});

describe("mergeAnalyticsReports — общая картина студии", () => {
  // Мастер А: Пн–Пт 10–18, два визита по 4000 ₽. Мастер Б: только вторник
  // 10–11, один визит за 1000 ₽.
  const longService = service("color", 4000, 240);
  const shortService = service("cut", 1000, 60);
  const reportA = buildAnalyticsReport({
    bookings: [
      booking("a1", longService, "2025-10-13T10:00"),
      booking("a2", longService, "2025-10-14T10:00"),
    ],
    services: [longService],
    clients: [client("a1"), client("a2")],
    availabilityRules: rules,
    blockedSlots: [],
    timezone: zone,
    period: "month",
    now,
  });
  const reportB = buildAnalyticsReport({
    bookings: [booking("b1", shortService, "2025-10-14T10:00")],
    services: [shortService],
    clients: [client("b1")],
    availabilityRules: [{ id: "rb", profileId: "p", weekday: 2, startTime: "10:00", endTime: "11:00", isActive: true }],
    blockedSlots: [],
    timezone: zone,
    period: "month",
    now,
  });
  const team = mergeAnalyticsReports([
    { name: "Анна", report: reportA },
    { name: "Борис", report: reportB },
  ]);

  it("складывает деньги и визиты, средний чек — из сумм", () => {
    expect(team.revenue.value).toBe(9000);
    expect(team.visits.value).toBe(3);
    // Не среднее средних (4000 и 1000 → 2500).
    expect(team.averageCheck.value).toBe(3000);
  });

  it("загрузка — из минут всей команды, а не средний процент", () => {
    expect(reportA.load.pastPct).toBe(10); // 480 из 4920 мин
    expect(reportB.load.pastPct).toBe(50); // 60 из 120 мин
    // (480 + 60) / (4920 + 120) = 10,7% — а не (10 + 50) / 2 = 30%.
    expect(team.load.pastPct).toBe(11);
  });

  it("подписывает услуги именем мастера и складывает клиентов", () => {
    expect(team.services.map((row) => row.title).sort()).toEqual(["color · Анна", "cut · Борис"]);
    expect(team.clients.total).toBe(3);
    expect(team.chart.reduce((sum, bucket) => sum + bucket.revenue, 0)).toBe(9000);
  });
});
