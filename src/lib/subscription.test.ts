import { describe, expect, it } from "vitest";
import { resolveSubscription } from "@/lib/subscription";

const day = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * day).toISOString();

describe("resolveSubscription: пауза", () => {
  const paid = {
    subscriptionTier: "solo-plus",
    subscriptionUntil: inDays(40),
    joinedAt: inDays(-100),
  };

  it("оплаченный тариф без паузы активен", () => {
    const access = resolveSubscription(paid);
    expect(access.isActive).toBe(true);
    expect(access.pausedUntil).toBeNull();
  });

  it("на паузе доступа нет, но тариф и срок видны", () => {
    const access = resolveSubscription({ ...paid, subscriptionPausedUntil: inDays(10) });
    expect(access.isActive).toBe(false);
    expect(access.planId).toBe("solo-plus");
    expect(access.pausedUntil).not.toBeNull();
    expect(access.activeUntil).toBe(paid.subscriptionUntil);
    expect(access.capabilities).toEqual([]);
  });

  it("прошедшая пауза ничего не значит", () => {
    const access = resolveSubscription({ ...paid, subscriptionPausedUntil: inDays(-1) });
    expect(access.isActive).toBe(true);
    expect(access.pausedUntil).toBeNull();
  });

  it("пауза не оживляет истёкший тариф", () => {
    const access = resolveSubscription({
      ...paid,
      subscriptionUntil: inDays(-1),
      subscriptionPausedUntil: inDays(5),
    });
    expect(access.isActive).toBe(false);
    expect(access.pausedUntil).toBeNull();
  });
});
