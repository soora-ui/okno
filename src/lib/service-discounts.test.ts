import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  currentPeriodDiscount,
  hotWindowsDiscountUntilIso,
  noServiceDiscounts,
  resolveBookingDiscount,
  validateServiceDiscountSettings,
} from "@/lib/service-discounts";

const now = new Date("2026-10-21T09:00:00Z");
const promo = {
  ...noServiceDiscounts,
  discountPercent: 20,
  discountStartsOn: "2026-10-20",
  discountEndsOn: "2026-10-31",
};

describe("resolveBookingDiscount", () => {
  it("applies the period discount by visit date, both ends inclusive", () => {
    const at = (visitDate: string) =>
      resolveBookingDiscount({
        service: promo,
        visitDate,
        visitStartIso: `${visitDate}T10:00:00Z`,
        isFirstVisit: false,
        now,
      });

    expect(at("2026-10-20")).toEqual({ percent: 20, kind: "period" });
    expect(at("2026-10-31")).toEqual({ percent: 20, kind: "period" });
    expect(at("2026-11-01")).toBeNull();
    expect(at("2026-10-19")).toBeNull();
  });

  it("gives the first-visit discount only to known new clients", () => {
    const service = { ...noServiceDiscounts, firstVisitDiscountPercent: 10 };
    const input = {
      service,
      visitDate: "2026-10-22",
      visitStartIso: "2026-10-22T10:00:00Z",
      now,
    };

    expect(resolveBookingDiscount({ ...input, isFirstVisit: true })).toEqual({
      percent: 10,
      kind: "first_visit",
    });
    expect(resolveBookingDiscount({ ...input, isFirstVisit: false })).toBeNull();
    expect(resolveBookingDiscount({ ...input, isFirstVisit: null })).toBeNull();
  });

  it("does not stack discounts and picks the largest", () => {
    expect(
      resolveBookingDiscount({
        service: { ...promo, firstVisitDiscountPercent: 25 },
        visitDate: "2026-10-22",
        visitStartIso: "2026-10-22T10:00:00Z",
        isFirstVisit: true,
        hotWindows: { percent: 15, untilIso: "2026-10-23T20:59:59Z" },
        now,
      }),
    ).toEqual({ percent: 25, kind: "first_visit" });
  });

  it("applies the hot-windows discount only to visits before its end", () => {
    const hotWindows = { percent: 30, untilIso: "2026-10-23T20:59:59Z" };
    const at = (visitStartIso: string) =>
      resolveBookingDiscount({
        service: noServiceDiscounts,
        visitDate: visitStartIso.slice(0, 10),
        visitStartIso,
        isFirstVisit: false,
        hotWindows,
        now,
      });

    expect(at("2026-10-23T18:00:00Z")).toEqual({ percent: 30, kind: "hot_windows" });
    expect(at("2026-10-24T08:00:00Z")).toBeNull();
    // Скидка закончилась — запись после неё по полной цене.
    expect(
      resolveBookingDiscount({
        service: noServiceDiscounts,
        visitDate: "2026-10-23",
        visitStartIso: "2026-10-23T18:00:00Z",
        isFirstVisit: false,
        hotWindows,
        now: new Date("2026-10-24T00:00:00Z"),
      }),
    ).toBeNull();
  });
});

describe("discount helpers", () => {
  it("rounds the discounted price to whole rubles", () => {
    expect(applyDiscount(2500, 20)).toBe(2000);
    expect(applyDiscount(1990, 15)).toBe(1692);
  });

  it("ends the hot-windows discount at the end of the master's day", () => {
    expect(hotWindowsDiscountUntilIso("2026-10-23", "Europe/Moscow")).toBe(
      "2026-10-23T20:59:59.999Z",
    );
  });

  it("labels running and upcoming promos for the catalog", () => {
    expect(currentPeriodDiscount(promo, "2026-10-21")).toEqual({
      percent: 20,
      label: "до 31 октября",
      startsLater: false,
    });
    expect(currentPeriodDiscount(promo, "2026-10-18")).toMatchObject({
      label: "с 20 октября по 31 октября",
      startsLater: true,
    });
    expect(currentPeriodDiscount(promo, "2026-11-01")).toBeNull();
  });

  it("rejects promos without an end date or out of range", () => {
    expect(validateServiceDiscountSettings({ ...promo, discountEndsOn: null }).ok).toBe(false);
    expect(validateServiceDiscountSettings({ ...promo, discountPercent: 95 }).ok).toBe(false);
    expect(
      validateServiceDiscountSettings({
        ...promo,
        discountStartsOn: "2026-11-02",
      }).ok,
    ).toBe(false);
    expect(validateServiceDiscountSettings(promo).ok).toBe(true);
  });
});
