-- Пресет «Олива» добавили в код (booking-theme-presets.ts, a54635b), но
-- ограничение из 202604190001 так и пускало только четыре старых пресета:
-- сохранение «Оливы» падало с нарушением check. Список здесь должен
-- совпадать с bookingThemePresetIds.
alter table profiles
  drop constraint if exists profiles_booking_theme_preset_check;

alter table profiles
  add constraint profiles_booking_theme_preset_check
  check (booking_theme_preset in ('linen', 'olive', 'merlot', 'lagoon', 'rosewood'));
