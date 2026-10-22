import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { landingDemoProfile } from "@/lib/landing-demo";
import type { AvailabilityRule, Booking, Service } from "@/lib/mock-data";
import { buildBookingSlotsForService } from "@/lib/slots";
import { noServiceDiscounts } from "@/lib/service-discounts";

const zone = "Europe/Simferopol";
const profile = { ...landingDemoProfile, timezone: zone, slotIntervalMinutes: 30, bookingWindowDays: 7 };
const tomorrow = DateTime.now().setZone(zone).startOf("day").plus({ days: 1 });
const day = tomorrow.toISODate() ?? "";

const rules: AvailabilityRule[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  id: `rule-${weekday}`,
  profileId: profile.id,
  weekday,
  startTime: "10:00",
  endTime: "18:00",
  isActive: true,
}));

function service(durationMinutes: number, bufferMinutes: number): Service {
  return {
    id: `svc-${durationMinutes}-${bufferMinutes}`,
    profileId: profile.id,
    title: "Услуга",
    description: "",
    durationMinutes,
    price: 1000,
    isActive: true,
    sortOrder: 1,
    repeatIntervalDays: null,
    bufferMinutes,
    prepaymentType: "none",
    prepaymentValue: 0,
    ...noServiceDiscounts,
  };
}

function booking(start: string, end: string, busyUntil: string): Booking {
  const at = (time: string) => tomorrow.set({ hour: Number(time.slice(0, 2)), minute: Number(time.slice(3)) }).toUTC().toISO() ?? "";
  return {
    id: `booking-${start}`,
    profileId: profile.id,
    clientId: "client",
    serviceId: "other",
    status: "confirmed",
    startsAt: at(start),
    endsAt: at(end),
    busyUntil: at(busyUntil),
    source: "public_page",
    clientNote: "",
    cancellationToken: "",
    cancellationTokenExpiresAt: "",
    createdAt: "",
    cancelledAt: null,
    visitStatus: "pending",
    visitStatusSetAt: null,
    prepaymentRequired: false,
  };
}

function timesFor(target: Service, bookings: Booking[]) {
  const slots = buildBookingSlotsForService({
    profile,
    service: target,
    availabilityRules: rules,
    blockedSlots: [],
    bookings,
  });
  return slots.find((slot) => slot.value === day)?.times ?? [];
}

describe("свободные окна и перерыв услуги", () => {
  it("уже сделанная запись занята до своего busy_until — с перерывом её услуги", () => {
    // 10:00–11:20, перерыв 15 мин → занято до 11:35, ближайшее окно по сетке — 12:00.
    const times = timesFor(service(60, 0), [booking("10:00", "11:20", "11:35")]);
    expect(times).not.toContain("11:30");
    expect(times).toContain("12:00");
  });

  it("без перерыва у сделанной записи следующее окно — сразу по сетке", () => {
    const times = timesFor(service(60, 0), [booking("10:00", "11:20", "11:20")]);
    expect(times).toContain("11:30");
  });

  it("перерыв новой услуги не даёт ей встать вплотную перед следующей записью", () => {
    const existing = [booking("12:00", "13:00", "13:00")];
    // 60 мин + 15 мин перерыва: 11:00 закончится в 12:15 — пересекается с 12:00.
    expect(timesFor(service(60, 15), existing)).not.toContain("11:00");
    expect(timesFor(service(60, 15), existing)).toContain("10:30");
    // Та же услуга без перерыва в 11:00 помещается.
    expect(timesFor(service(60, 0), existing)).toContain("11:00");
  });

  it("тысячи прошлых записей не тормозят расчёт и не занимают будущие окна", () => {
    const past = Array.from({ length: 3000 }, (_, index) => {
      const start = tomorrow.minus({ days: 2 + (index % 90), hours: index % 8 });
      return {
        ...booking("10:00", "11:00", "11:00"),
        id: `past-${index}`,
        startsAt: start.toUTC().toISO() ?? "",
        endsAt: start.plus({ hours: 1 }).toUTC().toISO() ?? "",
        busyUntil: start.plus({ hours: 1 }).toUTC().toISO() ?? "",
      };
    });
    const startedAt = performance.now();
    const times = timesFor(service(60, 0), past);
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(times).toContain("10:00");
    expect(times).toContain("17:00");
  });
});
