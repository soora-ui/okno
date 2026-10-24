import {
  bookingThemeAttr,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";
import { brandThemeAttrValue } from "@/lib/brand-theme/css";
import type { BrandTheme } from "@/lib/brand-theme/schema";

/**
 * Атрибуты корня клиентского пути мастера. Фирменный стиль, если он
 * применён, перекрывает пресет; схема бренда фиксируется явно, чтобы тёмный
 * телефон клиента не перекрасил светлый бренд и наоборот.
 */
export function publicThemeAttr(
  presetId: BookingThemePresetId,
  brandTheme: BrandTheme | null,
) {
  if (brandTheme) {
    return {
      "data-booking-theme": brandThemeAttrValue,
      "data-booking-theme-mode": brandTheme.scheme,
    } as const;
  }

  return bookingThemeAttr(presetId);
}
