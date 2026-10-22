-- Скидки мастера: на услугу по периоду, на первый визит и на горящие окошки.
--
-- Период скидки — даты визита в часовом поясе мастера, обе включительно:
-- скидка действует, если сам визит попадает в даты акции, а не день, когда
-- клиент записался. Иначе в последний день акции записались бы на три
-- месяца вперёд.
--
-- Скидки не складываются: к записи применяется самая большая из подходящих.
-- Итоговую цену считает код (src/lib/service-discounts.ts) и кладёт в
-- bookings.price; триггер снимка цены (202610190001) подставляет полную цену,
-- только если код цену не передал. Миграцию нужно применить раньше кода:
-- код читает новые колонки.

alter table if exists services
add column if not exists discount_percent integer,
add column if not exists discount_starts_on date,
add column if not exists discount_ends_on date,
add column if not exists first_visit_discount_percent integer;

alter table if exists services
drop constraint if exists services_discount_percent_range,
drop constraint if exists services_discount_period_valid,
drop constraint if exists services_first_visit_discount_range;

alter table if exists services
add constraint services_discount_percent_range
  check (discount_percent is null or discount_percent between 1 and 90),
add constraint services_discount_period_valid
  check (
    discount_percent is null
    or (
      discount_ends_on is not null
      and (discount_starts_on is null or discount_starts_on <= discount_ends_on)
    )
  ),
add constraint services_first_visit_discount_range
  check (first_visit_discount_percent is null or first_visit_discount_percent between 1 and 90);

-- Скидка на горящие окошки — у мастера, не у услуги: окошки в сторис общие
-- для всех услуг. Действует на визиты, которые начинаются раньше until.
alter table if exists profiles
add column if not exists hot_windows_discount_percent integer,
add column if not exists hot_windows_discount_until timestamptz;

alter table if exists profiles
drop constraint if exists profiles_hot_windows_discount_range;

alter table if exists profiles
add constraint profiles_hot_windows_discount_range
  check (hot_windows_discount_percent is null or hot_windows_discount_percent between 1 and 90);

-- Какая скидка досталась записи — мастеру видно, почему цена ниже.
alter table if exists bookings
add column if not exists discount_percent integer,
add column if not exists discount_kind text;

alter table if exists bookings
drop constraint if exists bookings_discount_valid;

alter table if exists bookings
add constraint bookings_discount_valid
  check (
    (discount_percent is null and discount_kind is null)
    or (
      discount_percent between 1 and 90
      and discount_kind in ('period', 'first_visit', 'hot_windows')
    )
  );

-- Клиенты из переноса базы (YCLIENTS, DIKIDI, таблицы) у мастера уже бывали,
-- хотя записей в okno у них нет: скидка на первый визит им не положена.
alter table if exists clients
add column if not exists imported_at timestamptz;
