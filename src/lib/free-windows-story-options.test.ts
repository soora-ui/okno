import { describe, expect, it } from "vitest";
import {
  defaultStoryPalette,
  parseStoryPalette,
  parseStoryStyle,
} from "@/lib/free-windows-story-options";
import { buildFreeWindowsStoryHtml, masterInitials } from "@/lib/free-windows-story";

describe("варианты сторис", () => {
  it("цвет по умолчанию — в тон странице мастера", () => {
    expect(defaultStoryPalette("linen")).toBe("sage");
    expect(defaultStoryPalette("merlot")).toBe("merlot");
  });

  it("чужие значения из ссылки не проходят", () => {
    expect(parseStoryStyle("ink")).toBe("ink");
    expect(parseStoryStyle("<svg>")).toBe("light");
    expect(parseStoryPalette("lagoon")).toBe("lagoon");
    expect(parseStoryPalette("linen")).toBeNull();
  });
});

describe("разметка сторис", () => {
  const day = {
    date: "2026-10-20",
    label: "Сегодня, 20 октября",
    dayName: "Сегодня",
    dateLabel: "20 октября",
    windows: ["09:00", "11:00", "13:00", "15:00"].map((start) => ({
      start,
      end: start.replace(/^(\d\d)/, (hour) => String(Number(hour) + 1).padStart(2, "0")),
      serviceId: "a",
    })),
  };

  it("экранирует имя мастера и режет окошки по числу дней", () => {
    const html = buildFreeWindowsStoryHtml({
      days: [day, day, day],
      masterName: "Аня <b>",
      publicLink: "okno.business/anya",
      style: "light",
      palette: "sage",
    });
    expect(html).toContain("Аня &lt;b&gt;");
    expect(html).not.toContain("<b>");
    // Три дня — по два окошка в день.
    expect(html.match(/09:00–10:00/g)).toHaveLength(3);
    expect(html).not.toContain("13:00–14:00");
  });

  it("не оставляет прозрачный чёрный в градиентах", () => {
    for (const style of ["light", "arch", "ink"] as const) {
      const html = buildFreeWindowsStoryHtml({
        days: [day],
        masterName: "Аня",
        publicLink: "okno.business/anya",
        style,
        palette: "olive",
      });
      expect(html).not.toContain("transparent");
    }
  });

  it("инициалы — первые буквы двух слов", () => {
    expect(masterInitials("мария левина")).toBe("МЛ");
    expect(masterInitials("Алина")).toBe("А");
    expect(masterInitials("  ")).toBe("•");
  });
});
