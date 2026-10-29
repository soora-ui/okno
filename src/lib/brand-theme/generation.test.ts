import { describe, expect, it } from "vitest";
import {
  buildBrandThemeBriefText,
  normalizeGeneratedTheme,
  normalizeHexList,
  type GeneratedVariant,
} from "@/lib/brand-theme/generation-prompt";
import { BrandMaterialError, prepareBrandMaterial } from "@/lib/brand-theme/materials";
import { brandThemeSamples } from "@/lib/brand-theme/samples";

const rose = brandThemeSamples.rose;

function variant(overrides: Partial<GeneratedVariant> = {}): GeneratedVariant {
  return {
    name: "Ближе к брендбуку",
    explanation: "Пудровый фон и бордовая кнопка, как на вывеске.",
    scheme: "light",
    colors: { ...rose.colors },
    headingFont: "cormorant-garamond",
    bodyFont: "nunito",
    headingWeight: 600,
    headingTracking: -0.01,
    radiusCard: 22,
    radiusButton: 999,
    radiusImage: 16,
    shadow: "soft",
    decor: "botanical",
    ...overrides,
  };
}

describe("normalizeGeneratedTheme", () => {
  it("собирает строгую тему из ответа модели", () => {
    expect(normalizeGeneratedTheme(variant())).toEqual(rose);
  });

  it("загоняет числа в рамки схемы", () => {
    const theme = normalizeGeneratedTheme(
      variant({ headingWeight: 950, headingTracking: 1, radiusCard: 120, radiusButton: 60, radiusImage: -4 }),
    );
    expect(theme?.fonts.headingWeight).toBe(800);
    expect(theme?.fonts.headingTracking).toBe(0.2);
    expect(theme?.radius).toEqual({ card: 40, button: 999, image: 0 });
  });

  it("понимает короткий и заглавный hex", () => {
    const theme = normalizeGeneratedTheme(
      variant({ colors: { ...rose.colors, buttonText: "#FFF", ink: "3A2A2C" } }),
    );
    expect(theme?.colors.buttonText).toBe("#ffffff");
    expect(theme?.colors.ink).toBe("#3a2a2c");
  });

  it("отбрасывает вариант с нераспознанным цветом, а не подменяет его", () => {
    expect(
      normalizeGeneratedTheme(variant({ colors: { ...rose.colors, accent: "пудровый" } })),
    ).toBeNull();
  });

  it("не даёт рукописному шрифту стать основным", () => {
    expect(normalizeGeneratedTheme(variant({ bodyFont: "caveat" }))?.fonts.body).toBe("nunito");
  });
});

describe("normalizeHexList", () => {
  it("оставляет только цвета", () => {
    expect(normalizeHexList(["#C98F93", "abc", "red", ""])).toEqual(["#c98f93", "#aabbcc"]);
  });
});

describe("buildBrandThemeBriefText", () => {
  it("пишет только заполненное и передаёт комментарий к перегенерации", () => {
    const text = buildBrandThemeBriefText({
      specialty: "Барбер",
      workspaceName: "Латунь",
      hexColors: ["#c9a24f"],
      colorWords: "",
      moods: ["Строго", "Люкс"],
      wishes: "",
      regenerationComment: "слишком жёлто",
    });
    expect(text).toContain("Барбер, «Латунь»");
    expect(text).toContain("#c9a24f");
    expect(text).toContain("Строго, Люкс");
    expect(text).toContain("слишком жёлто");
    expect(text).not.toContain("Пожелания");
  });
});

describe("prepareBrandMaterial", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#8e4a55"/></svg>';

  it("определяет тип по содержимому, а не по имени", async () => {
    const material = await prepareBrandMaterial(
      "example",
      new File([png], "photo.jpg", { type: "image/jpeg" }),
    );
    expect(material.type).toBe("image/png");
  });

  it("не пускает не-картинки под видом картинок", async () => {
    await expect(
      prepareBrandMaterial("example", new File(["<html>"], "x.png", { type: "image/png" })),
    ).rejects.toBeInstanceOf(BrandMaterialError);
  });

  it("PDF — только для брендбука", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4");
    await expect(prepareBrandMaterial("example", new File([pdf], "x.pdf"))).rejects.toThrow(
      "PNG или JPG",
    );
  });

  it("SVG-логотип сразу превращается в PNG", async () => {
    const material = await prepareBrandMaterial("logo", new File([svg], "logo.svg"));
    expect(material.type).toBe("image/png");
    expect(Array.from(material.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("скрипт внутри SVG не переживает растеризацию", async () => {
    const evil = svg.replace("<rect", '<script>alert(1)</script><rect');
    const material = await prepareBrandMaterial("logo", new File([evil], "logo.svg"));
    expect(new TextDecoder().decode(material.bytes)).not.toContain("alert");
  });

  it("SVG вне логотипа не принимается", async () => {
    await expect(prepareBrandMaterial("example", new File([svg], "x.svg"))).rejects.toBeInstanceOf(
      BrandMaterialError,
    );
  });

  it("логотип в JPG не принимается: нужна прозрачность", async () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    await expect(prepareBrandMaterial("logo", new File([jpg], "logo.jpg"))).rejects.toThrow(
      "SVG или PNG",
    );
  });
});
