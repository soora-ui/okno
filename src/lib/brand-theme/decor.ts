import type { BrandDecorSlot, BrandDecorStyle, BrandTheme } from "@/lib/brand-theme/schema";

/**
 * Стиль декора для конкретного слота страницы или null, если в этом месте
 * рисовать нечего: фирменного стиля нет, мастер выключил слот (макет 4.12)
 * или стиль «без декора».
 */
export function decorFor(theme: BrandTheme | null, slot: BrandDecorSlot): BrandDecorStyle | null {
  if (!theme || theme.decor === "none" || !theme.decorSlots[slot]) return null;
  return theme.decor;
}

/** Логотип для схемы темы: на тёмной — светлая версия, если мастер её загрузил. */
export function brandLogoPath(theme: BrandTheme | null): string | null {
  if (!theme?.logo) return null;
  return theme.scheme === "dark" ? (theme.logo.darkPath ?? theme.logo.path) : theme.logo.path;
}
