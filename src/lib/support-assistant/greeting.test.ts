import { describe, expect, it } from "vitest";
import { applySupportGreeting } from "@/lib/support-assistant/greeting";

const base = { isFirstMessageToday: false, message: "где тарифы", history: [] };

describe("applySupportGreeting", () => {
  it("здоровается в первом сообщении дня, даже если пользователь не поздоровался", () => {
    expect(applySupportGreeting("Тарифы — в Настройках.", { ...base, isFirstMessageToday: true })).toBe(
      "Привет! Тарифы — в Настройках.",
    );
  });

  it("отвечает на приветствие пользователя", () => {
    expect(
      applySupportGreeting("Ссылка — в Настройки → Профиль.", {
        ...base,
        message: "Привет! Где взять ссылку на запись?",
      }),
    ).toBe("Привет! Ссылка — в Настройки → Профиль.");
  });

  it("второй раз за разговор не здоровается", () => {
    expect(
      applySupportGreeting("Готово.", {
        ...base,
        message: "привет ещё раз",
        history: [{ role: "assistant", content: "Привет! Тарифы — в Настройках." }],
      }),
    ).toBe("Готово.");
  });

  it("без повода не здоровается и срезает приветствие модели", () => {
    expect(applySupportGreeting("Здравствуй! тарифы — в Настройках.", base)).toBe(
      "Тарифы — в Настройках.",
    );
  });

  it("не путает слово с приветствием в середине фразы", () => {
    expect(
      applySupportGreeting("Ок.", { ...base, message: "как написать клиенту привет" }),
    ).toBe("Ок.");
  });
});
