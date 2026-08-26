import { describe, expect, it } from "vitest";
import { sanitizeLogContext, sanitizeLogValue } from "./sanitize";

describe("sanitizeLogValue", () => {
  it("разворачивает Error, который JSON.stringify сплющивал в {}", () => {
    const context = sanitizeLogContext({ error: new Error("boom") });

    expect(JSON.stringify(new Error("boom"))).toBe("{}");
    expect(context).toMatchObject({
      error: { name: "Error", message: "boom" },
    });
  });

  it("достаёт причину из cause — там лежит настоящий сбой сети", () => {
    const error = new Error("fetch failed", {
      cause: new Error("other side closed"),
    });

    const result = sanitizeLogValue(error) as Record<string, unknown>;

    expect(result.message).toBe("fetch failed");
    expect(result.cause).toMatchObject({ message: "other side closed" });
  });

  it("прячет чувствительные поля на любой глубине", () => {
    const result = sanitizeLogContext({
      user: { phone: "+79990000000", name: "Алина" },
      authorization: "Bearer x",
    });

    expect(result).toEqual({
      user: { phone: "[redacted]", name: "Алина" },
      authorization: "[redacted]",
    });
  });

  it("оставляет ошибки Supabase как есть — они обычные объекты", () => {
    const result = sanitizeLogValue({
      code: "42703",
      message: "column profiles.autopay_period_days does not exist",
      hint: null,
    });

    expect(result).toEqual({
      code: "42703",
      message: "column profiles.autopay_period_days does not exist",
      hint: null,
    });
  });

  it("режет длинные строки и большие массивы", () => {
    const long = sanitizeLogValue("x".repeat(400)) as string;
    const many = sanitizeLogValue(Array.from({ length: 25 }, (_, i) => i)) as unknown[];

    expect(long).toHaveLength(301);
    expect(long.endsWith("…")).toBe(true);
    expect(many).toHaveLength(21);
    expect(many.at(-1)).toBe("…ещё 5");
  });

  it("всё, что положено в context, переживает JSON.stringify", () => {
    const context = sanitizeLogContext({
      error: new Error("boom"),
      when: new Date("2026-08-19T10:09:00.000Z"),
      count: Number.NaN,
      retry: () => undefined,
    });

    expect(JSON.parse(JSON.stringify(context))).toMatchObject({
      when: "2026-08-19T10:09:00.000Z",
      count: "NaN",
      retry: "[function]",
    });
  });
});
