-- Предоплата: привести таблицу prepayments к схеме из 202607090002.
--
-- На проде prepayments появилась раньше той миграции (вручную, со столбцом
-- appointment_id), и create table if not exists её пропустил. Код с июля
-- пишет booking_id и idempotence_key — запись на услугу с предоплатой падала
-- на вставке prepayments. Заодно не применилось расширение ограничения
-- bookings_no_overlap_excl на pending_payment: пока клиент оплачивает,
-- слот не был защищён от двойной записи.
--
-- Миграция идемпотентна: на базе, созданной по миграциям с нуля, переименовывать
-- нечего, остальное — if not exists.

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prepayments' and column_name = 'appointment_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prepayments' and column_name = 'booking_id'
  ) then
    alter table prepayments rename column appointment_id to booking_id;
  end if;

  if exists (select 1 from pg_constraint where conname = 'prepayments_appointment_id_fkey') then
    alter table prepayments rename constraint prepayments_appointment_id_fkey to prepayments_booking_id_fkey;
  end if;
end $$;

drop index if exists idx_prepayments_appointment;
drop index if exists idx_prepayments_profile_id;

-- У старых строк ключа идемпотентности не было: ЮKassa его уже не спросит.
alter table prepayments add column if not exists idempotence_key text;
update prepayments set idempotence_key = gen_random_uuid()::text where idempotence_key is null;
alter table prepayments alter column idempotence_key set not null;

alter table prepayments add column if not exists metadata jsonb;

create index if not exists idx_prepayments_booking on prepayments(booking_id);
create index if not exists idx_prepayments_profile on prepayments(profile_id);
create index if not exists idx_prepayments_provider_id on prepayments(provider_payment_id);
create index if not exists idx_prepayments_status_expires on prepayments(status, expires_at);

alter table prepayments enable row level security;

drop policy if exists "Owners can view own prepayments" on prepayments;
drop policy if exists "Owners can manage own prepayments" on prepayments;
create policy "Owners can manage own prepayments" on prepayments
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = prepayments.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = prepayments.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);

-- Слот, ожидающий оплаты, занимает время так же, как подтверждённый.
alter table if exists bookings
drop constraint if exists bookings_no_overlap_excl;

alter table if exists bookings
add constraint bookings_no_overlap_excl
exclude using gist (
  profile_id with =,
  tstzrange(starts_at, busy_until, '[)') with &&
)
where (status in ('confirmed', 'pending_payment'));

commit;

-- Откат (только ограничение и политика; переименование столбца не откатываем —
-- код работает с booking_id):
-- begin;
-- alter table bookings drop constraint if exists bookings_no_overlap_excl;
-- alter table bookings add constraint bookings_no_overlap_excl exclude using gist
--   (profile_id with =, tstzrange(starts_at, busy_until, '[)') with &&) where (status = 'confirmed');
-- commit;
