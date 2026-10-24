import { describe, expect, it } from "vitest";
import {
  brandThemeContrastIssues,
  contrastRatio,
  ensureContrast,
  fixBrandThemeContrast,
} from "@/lib/brand-theme/contrast";
import { brandThemeSamples } from "@/lib/brand-theme/samples";

describe("contrastRatio", () => {
  it("чёрный на белом — 21:1, одинаковые цвета — 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#c98f93", "#c98f93")).toBeCloseTo(1, 5);
  });
});

describe("ensureContrast", () => {
  it("не трогает уже читаемый цвет", () => {
    expect(ensureContrast("#3a2a2c", "#f8f0ea")).toBe("#3a2a2c");
  });

  it("затемняет светлый текст на светлом фоне до AA", () => {
    const fixed = ensureContrast("#e8b9c6", "#fbf7f4");
    expect(contrastRatio(fixed, "#fbf7f4")).toBeGreaterThanOrEqual(4.5);
  });

  it("осветляет тёмный текст на тёмном фоне", () => {
    const fixed = ensureContrast("#3a3428", "#12110f");
    expect(contrastRatio(fixed, "#12110f")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("fixBrandThemeContrast", () => {
  it("темы из макета проходят без правок", () => {
    for (const theme of Object.values(brandThemeSamples)) {
      expect(brandThemeContrastIssues(theme)).toEqual([]);
    }
  });

  it("чинит нечитаемую кнопку и сообщает об этом", () => {
    const broken = {
      ...brandThemeSamples.rose,
      colors: { ...brandThemeSamples.rose.colors, button: "#f3dcdc", buttonText: "#ffffff" },
    };
    const { theme, fixes } = fixBrandThemeContrast(broken);
    expect(brandThemeContrastIssues(theme)).toEqual([]);
    expect(fixes.some((fix) => fix.role === "buttonText")).toBe(true);
    // Фон кнопки — цвет бренда, его не двигаем.
    expect(theme.colors.button).toBe("#f3dcdc");
  });
});
