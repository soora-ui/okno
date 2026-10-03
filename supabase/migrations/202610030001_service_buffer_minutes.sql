-- Перерыв после визита переезжает из профиля в услугу: после одной услуги
-- нужно время на уборку и отдых, после другой — нет.
--
-- Совместимость в обе стороны: у каждой записи уже хранится свой busy_until
-- (конец визита + перерыв), и исключающее ограничение bookings_no_overlap_excl
-- работает по нему. Поэтому функции проверки конфликтов ниже тоже переходят
-- на busy_until существующих записей, а перерыв новой записи кладёт в
-- p_candidate_busy_end вызывающий код. Старый код (общий перерыв мастера)
-- пишет busy_until так же, так что миграцию можно применять раньше кода.

alter table if exists services
add column if not exists buffer_minutes integer;

-- Существующим услугам — нынешний перерыв мастера: окна записи у них не
-- сдвинутся, пока мастер сам не поменяет перерыв в карточке услуги.
update services as service
set buffer_minutes = greatest(coalesce(profile.buffer_minutes, 0), 0)
from profiles as profile
where profile.id = service.profile_id
  and service.buffer_minutes is null;

update services
set buffer_minutes = 0
where buffer_minutes is null;

alter table if exists services
alter column buffer_minutes set default 15,
alter column buffer_minutes set not null;

alter table if exists services
drop constraint if exists services_buffer_minutes_range;

alter table if exists services
add constraint services_buffer_minutes_range check (buffer_minutes between 0 and 180);

-- p_buffer_minutes остаётся в сигнатуре ради совместимости вызовов, но
-- больше не используется: перерыв существующей записи — её busy_until.
create or replace function public.has_booking_conflict(
  p_profile_id uuid,
  p_candidate_start timestamptz,
  p_candidate_busy_end timestamptz,
  p_buffer_minutes integer
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from bookings
    where profile_id = p_profile_id
      and status in ('confirmed', 'pending_payment')
      and p_candidate_start < busy_until
      and p_candidate_busy_end > starts_at

    union all

    select 1
    from blocked_slots
    where profile_id = p_profile_id
      and p_candidate_start < ends_at
      and p_candidate_busy_end > starts_at
  );
$$;

create or replace function public.has_booking_conflict_excluding_current(
  p_profile_id uuid,
  p_candidate_start timestamptz,
  p_candidate_busy_end timestamptz,
  p_buffer_minutes integer,
  p_exclude_booking_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from bookings
    where profile_id = p_profile_id
      and status in ('confirmed', 'pending_payment')
      and id <> p_exclude_booking_id
      and p_candidate_start < busy_until
      and p_candidate_busy_end > starts_at

    union all

    select 1
    from blocked_slots
    where profile_id = p_profile_id
      and p_candidate_start < ends_at
      and p_candidate_busy_end > starts_at
  );
$$;
