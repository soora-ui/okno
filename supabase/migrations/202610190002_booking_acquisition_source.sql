-- Источник онлайн-записи (документы/источники-записей.md): откуда клиент
-- пришёл на страницу мастера — метка из ссылки (?from=instagram) или
-- догадка по Referer. null — источник не определён или запись ручная.
--
-- Код пишет колонку, но при её отсутствии повторяет вставку без неё,
-- поэтому порядок «миграция → код» желателен, но не обязателен.

alter table if exists bookings
add column if not exists acquisition_source text;

alter table if exists bookings
drop constraint if exists bookings_acquisition_source_check;

alter table if exists bookings
add constraint bookings_acquisition_source_check check (
  acquisition_source is null
  or acquisition_source in (
    'instagram', 'telegram', 'vk', 'whatsapp', 'avito',
    'yandex_maps', 'twogis', 'search'
  )
);

-- Сводка в кабинете читает записи мастера за последние 30 дней по created_at.
create index if not exists bookings_profile_created_at_idx
  on bookings (profile_id, created_at desc);
