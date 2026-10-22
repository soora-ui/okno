import {
  BellRing,
  Gift,
  LayoutTemplate,
  Palette,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type RecordTabSectionId =
  | "booking-params"
  | "booking-page"
  | "certificates"
  | "telegram"
  | "color-palette";

export type RecordTabSectionMeta = {
  id: RecordTabSectionId;
  label: string;
  /** Короткая подпись под названием: в навигации и в мобильном аккордеоне. */
  hint: string;
  icon: LucideIcon;
};

// Единый источник правды для порядка/подписей разделов вкладки «Запись» —
// саб-сайдбар (десктоп) и аккордеон (мобильный) читают отсюда, чтобы не
// дублировать список в двух местах (okno-tz-record-tab-navigation.md).
// Порядок — по частоте использования: операционные разделы наверх,
// «настроил один раз и забыл» — вниз.
export const RECORD_TAB_SECTIONS: RecordTabSectionMeta[] = [
  { id: "booking-params", label: "Параметры записи", hint: "Окно, шаг, отмена, напоминания", icon: SlidersHorizontal },
  { id: "booking-page", label: "Витрина страницы записи", hint: "Заголовок, подзаголовок, комментарий", icon: LayoutTemplate },
  { id: "certificates", label: "Подарочные сертификаты", hint: "Продажа на странице записи", icon: Gift },
  { id: "telegram", label: "Telegram-уведомления", hint: "Новые записи и напоминания тебе", icon: BellRing },
  { id: "color-palette", label: "Цвет клиентских страниц", hint: "Тема профиля и записи", icon: Palette },
];
