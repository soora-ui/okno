-- Снимок цены услуги в записи: выручка в аналитике считается по цене на
-- момент записи. Без снимка смена цены в услуге задним числом переписывала
-- всю прошлую выручку.
--
-- Цену ставит триггер, а не код: записи создаются в нескольких местах
-- (публичная страница, ручная запись), и так ни одна не останется без цены.
-- Код цену не пишет, поэтому миграцию можно применять раньше кода. Код,
-- который читает bookings.price, — только после неё.

alter table if exists bookings
add column if not exists price integer;

-- Старым записям — текущая цена услуги: точнее уже не узнать.
update bookings as booking
set price = service.price
from services as service
where service.id = booking.service_id
  and booking.price is null;

alter table if exists bookings
drop constraint if exists bookings_price_non_negative;

alter table if exists bookings
add constraint bookings_price_non_negative check (price is null or price >= 0);

create or replace function public.set_booking_price_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.price is null then
    select price into new.price
    from services
    where id = new.service_id;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_price_snapshot on bookings;

create trigger bookings_price_snapshot
before insert on bookings
for each row
execute function public.set_booking_price_snapshot();
