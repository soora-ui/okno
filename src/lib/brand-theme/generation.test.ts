import { describe, expect, it } from "vitest";
import {
  buildBrandThemeBriefText,
  normalizeGeneratedTheme,
  normalizeHexList,
  type GeneratedVariant,
} from "@/lib/brand-theme/generation-prompt";
import { BrandMaterialError, readBrandMaterials } from "@/lib/brand-theme/materials";
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

describe("readBrandMaterials", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it("определяет тип по содержимому, а не по имени", async () => {
    const [material] = await readBrandMaterials([
      { kind: "logo", file: new File([png], "logo.jpg", { type: "image/jpeg" }) },
    ]);
    expect(material.type).toBe("image/png");
  });

  it("не пускает не-картинки под видом картинок", async () => {
    await expect(
      readBrandMaterials([
        { kind: "example", file: new File(["<svg onload=alert(1)>"], "x.png", { type: "image/png" }) },
      ]),
    ).rejects.toBeInstanceOf(BrandMaterialError);
  });

  it("держит лимит на количество", async () => {
    const logos = [0, 1].map((index) => ({
      kind: "logo" as const,
      file: new File([png], `logo-${index}.png`),
    }));
    await expect(readBrandMaterials(logos)).rejects.toThrow("не больше 1");
  });
});
