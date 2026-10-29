import { brandFontFamily } from "@/components/brand-theme/brand-fonts";
import { brandThemeCss } from "@/lib/brand-theme/css";
import type { BrandTheme } from "@/lib/brand-theme/schema";

// В отличие от пресетов (их CSS статичен и лежит в корневом лейауте), тема
// мастера своя у каждого, поэтому <style> рендерится на его странице. Значения
// прошли zod-схему: только #rrggbb, числа и шрифты из белого списка.
export function BrandThemeStyle({
  theme,
  scope,
}: {
  theme: BrandTheme | null;
  // См. brandThemeCss: несколько тем на одной странице.
  scope?: string;
}) {
  if (!theme) {
    return null;
  }

  return <style>{brandThemeCss(theme, brandFontFamily, scope)}</style>;
}
