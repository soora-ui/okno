import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  buildFreeWindows,
  buildFreeWindowsShareText,
} from "@/lib/free-windows";
import type { BookingSlot, Service } from "@/lib/mock-data";

const zone = "Europe/Moscow";
// Понедельник, 19 октября 2026.
const now = DateTime.fromISO("2026-10-19T09:30", { zone });

function service(id: string, durationMinutes: number, isActive = true): Service {
  return {
    id,
    profileId: "p",
    title: id,
    description: "",
    durationMinutes,
    price: 1000,
    isActive,
    sortOrder: 1,
    repeatIntervalDays: null,
    bufferMinutes: 0,
    prepaymentType: "none",
    prepaymentValue: 0,
  };
}

function slot(value: string, times: string[]): BookingSlot {
  return { date: value, value, times };
}

describe("buildFreeWindows", () => {
  it("склеивает подряд идущие слоты в одно окошко до конца последней услуги", () => {
    const days = buildFreeWindows({
      services: [service("a", 60)],
      bookingSlotsByService: {
        a: [slot("2026-10-19", ["14:00", "14:30", "15:00", "17:00"])],
      },
      timezone: zone,
      now,
    });

    expect(days).toEqual([
      {
        date: "2026-10-19",
        label: "Сегодня, 19 октября",
        windows: [
          { start: "14:00", end: "16:00", serviceId: "a" },
          { start: "17:00", end: "18:00", serviceId: "a" },
        ],
      },
    ]);
  });

  it("объединяет услуги и ведёт ссылку на ту, что выше в списке", () => {
    const days = buildFreeWindows({
      services: [service("long", 120), service("short", 30)],
      bookingSlotsByService: {
        long: [slot("2026-10-20", ["12:00"])],
        short: [slot("2026-10-20", ["12:00", "14:00", "18:00"])],
      },
      timezone: zone,
      now,
    });

    expect(days[0].label).toBe("Завтра, 20 октября");
    expect(days[0].windows).toEqual([
      { start: "12:00", end: "14:30", serviceId: "long" },
      { start: "18:00", end: "18:30", serviceId: "short" },
    ]);
  });

  it("берёт только ближайшие три дня и пропускает неактивные услуги", () => {
    const days = buildFreeWindows({
      services: [service("a", 60), service("off", 60, false)],
      bookingSlotsByService: {
        a: [
          slot("2026-10-21", ["10:00"]),
          slot("2026-10-22", ["10:00"]),
        ],
        off: [slot("2026-10-19", ["10:00"])],
      },
      timezone: zone,
      now,
    });

    expect(days.map((day) => day.label)).toEqual(["Среда, 21 октября"]);
  });
});

describe("buildFreeWindowsShareText", () => {
  it("собирает пост с окошками и ссылкой", () => {
    const text = buildFreeWindowsShareText(
      [
        {
          date: "2026-10-19",
          label: "Сегодня, 19 октября",
          windows: [
            { start: "14:00", end: "16:00", serviceId: "a" },
            { start: "17:00", end: "18:00", serviceId: "a" },
          ],
        },
      ],
      "https://okno.business/alina",
    );

    expect(text).toBe(
      [
        "Есть свободные окошки на ближайшие дни:",
        "",
        "Сегодня, 19 октября: 14:00–16:00, 17:00–18:00",
        "",
        "Записаться онлайн: https://okno.business/alina",
      ].join("\n"),
    );
  });
});
