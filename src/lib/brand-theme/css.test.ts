import { describe, expect, it } from "vitest";
import { brandThemeCss, brandThemeVars } from "@/lib/brand-theme/css";
import { brandThemeSamples } from "@/lib/brand-theme/samples";
import { brandThemeSchema, normalizeBrandTheme } from "@/lib/brand-theme/schema";

const font = (id: string) => `"${id}", sans-serif`;

describe("brand theme schema", () => {
  it("принимает все темы из макета", () => {
    for (const theme of Object.values(brandThemeSamples)) {
      expect(brandThemeSchema.safeParse(theme).success).toBe(true);
    }
  });

  it("не пропускает в CSS ничего, кроме #rrggbb", () => {
    const broken = structuredClone(brandThemeSamples.rose) as unknown as {
      colors: Record<string, string>;
    };
    broken.colors.ink = "red;}body{display:none";
    expect(normalizeBrandTheme(broken)).toBeNull();
  });

  it("отбрасывает шрифт не из белого списка", () => {
    const broken = structuredClone(brandThemeSamples.rose) as unknown as {
      fonts: Record<string, string>;
    };
    broken.fonts.heading = "Comic Sans MS";
    expect(normalizeBrandTheme(broken)).toBeNull();
  });

  it("битое значение из базы даёт null, а не исключение", () => {
    expect(normalizeBrandTheme(null)).toBeNull();
    expect(normalizeBrandTheme("{}")).toBeNull();
  });
});

describe("brandThemeCss", () => {
  it("кладёт цвета бренда в те же переменные, что и пресеты", () => {
    const vars = brandThemeVars(brandThemeSamples.brass, font);
    expect(vars["--color-background"]).toBe("#12110f");
    expect(vars["--ui-primary-bg"]).toBe("#c9a24f");
    expect(vars["--ui-primary-text"]).toBe("#15120a");
    expect(vars["--radius-card"]).toBe("4px");
  });

  it("фиксирует схему бренда, а не следует за телефоном клиента", () => {
    const css = brandThemeCss(brandThemeSamples.brass, font);
    expect(css).toContain("color-scheme:dark");
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("подставляет шрифты через переданный резолвер", () => {
    const css = brandThemeCss(brandThemeSamples.rose, font);
    expect(css).toContain('--brand-font-heading:"cormorant-garamond", sans-serif');
    expect(css).toContain('--font-manrope:"nunito", sans-serif');
  });

  it("без теней не оставляет теней", () => {
    const vars = brandThemeVars(
      { ...brandThemeSamples.rose, shadow: "none" },
      font,
    );
    expect(vars["--shadow-card"]).toBe("none");
  });
});
