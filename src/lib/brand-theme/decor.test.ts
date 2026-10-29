import { describe, expect, it } from "vitest";
import { brandThemeCss } from "@/lib/brand-theme/css";
import { brandLogoPath, decorFor } from "@/lib/brand-theme/decor";
import { withOwnLogo } from "@/lib/brand-theme/drafts";
import { brandThemeSamples } from "@/lib/brand-theme/samples";
import { normalizeBrandTheme } from "@/lib/brand-theme/schema";

const rose = brandThemeSamples.rose;
const authId = "0b6c7e5e-1111-4222-8333-944455556666";
const ownLogo = `${authId}/brand-logo/0f1e2d3c-4b5a-4968-8776-655443322110.png`;

describe("decorFor", () => {
  it("рисует только во включённых слотах", () => {
    const theme = { ...rose, decorSlots: { ...rose.decorSlots, cards: false } };
    expect(decorFor(theme, "hero")).toBe("botanical");
    expect(decorFor(theme, "cards")).toBeNull();
  });

  it("без фирменного стиля и со стилем «без декора» — пусто", () => {
    expect(decorFor(null, "hero")).toBeNull();
    expect(decorFor({ ...rose, decor: "none" }, "hero")).toBeNull();
  });
});

describe("старые темы", () => {
  it("без новых полей получают прежний вид по умолчанию", () => {
    const legacy = { ...rose } as Record<string, unknown>;
    delete legacy.decorSlots;
    delete legacy.decorIntensity;
    delete legacy.logo;
    const theme = normalizeBrandTheme(legacy);
    expect(theme?.decorSlots.footer).toBe(false);
    expect(theme?.decorSlots.hero).toBe(true);
    expect(theme?.decorIntensity).toBe(60);
    expect(theme?.logo).toBeNull();
  });

  it("интенсивность уходит в CSS-переменную", () => {
    expect(brandThemeCss({ ...rose, decorIntensity: 30 }, (id) => id)).toContain(
      "--brand-decor-opacity:0.3",
    );
  });
});

describe("логотип", () => {
  it("схема не пускает внешние адреса и чужие форматы", () => {
    expect(normalizeBrandTheme({ ...rose, logo: { path: "https://evil.example/x.png", darkPath: null } })).toBeNull();
    expect(normalizeBrandTheme({ ...rose, logo: { path: `${authId}/brand-logo/x.svg`, darkPath: null } })).toBeNull();
  });

  it("чужая папка отбрасывается при сохранении", () => {
    const foreign = { ...rose, logo: { path: ownLogo.replace(authId, "someone-else"), darkPath: null } };
    expect(withOwnLogo(foreign, authId).logo).toBeNull();
    const own = { ...rose, logo: { path: ownLogo, darkPath: null } };
    expect(withOwnLogo(own, authId).logo?.path).toBe(ownLogo);
  });

  it("на тёмной теме берётся светлая версия, если есть", () => {
    const dark = ownLogo.replace(".png", "1.png");
    const theme = { ...brandThemeSamples.brass, logo: { path: ownLogo, darkPath: dark } };
    expect(brandLogoPath(theme)).toBe(dark);
    expect(brandLogoPath({ ...rose, logo: { path: ownLogo, darkPath: dark } })).toBe(ownLogo);
  });
});
