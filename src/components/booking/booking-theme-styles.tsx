import { bookingThemeCss } from "@/lib/booking-theme-presets";

// Один <style> на все пресеты. Рендерится в корневом лейауте: CSS статичен,
// весит около килобайта в сжатом виде и уезжает вместе с разметкой, зато
// снимает необходимость дублировать тег в каждой публичной странице и
// разбираться с вложенностью, когда одна такая страница содержит другую.
export function BookingThemeStyles() {
  return <style>{bookingThemeCss()}</style>;
}
