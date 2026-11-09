import { describe, expect, it } from "vitest";
import { getClientIp } from "./client-ip";

function requestWith(headers: Record<string, string>) {
  return new Request("https://okno.business/api/test", { headers });
}

describe("getClientIp", () => {
  it("берёт адрес из CF-Connecting-IP, а не из подставленного X-Forwarded-For", () => {
    const request = requestWith({
      "x-forwarded-for": "1.2.3.4, 203.0.113.7, 172.70.0.1",
      "cf-connecting-ip": "203.0.113.7",
      "x-real-ip": "203.0.113.7",
    });

    expect(getClientIp(request)).toBe("203.0.113.7");
  });

  it("без Cloudflare берёт X-Real-IP от nginx", () => {
    const request = requestWith({
      "x-forwarded-for": "1.2.3.4, 127.0.0.1",
      "x-real-ip": "127.0.0.1",
    });

    expect(getClientIp(request)).toBe("127.0.0.1");
  });

  it("из X-Forwarded-For берёт последний адрес, а не первый", () => {
    const request = requestWith({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" });

    expect(getClientIp(request)).toBe("198.51.100.9");
  });

  it("смена подставленного X-Forwarded-For не меняет адрес", () => {
    const first = requestWith({
      "x-forwarded-for": "10.0.0.1, 198.51.100.9",
    });
    const second = requestWith({
      "x-forwarded-for": "10.0.0.2, 198.51.100.9",
    });

    expect(getClientIp(first)).toBe(getClientIp(second));
  });

  it("без заголовков возвращает unknown", () => {
    expect(getClientIp(requestWith({}))).toBe("unknown");
    expect(getClientIp(requestWith({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});
