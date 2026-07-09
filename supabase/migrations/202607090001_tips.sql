-- Чаевые мастеру от клиента через ЮKassa. Платит клиент (анонимно, без
-- авторизации) прямо со страницы подтверждения записи. Источник истины по
-- статусу — ЮKassa: вебхук переспрашивает платёж через API и только тогда
-- помечает чаевые как оплаченные (тот же паттерн, что и subscription_payments).
create table if not exists tips (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null default 'yookassa',
  provider_payment_id text unique,
  amount integer not null check (amount > 0),  -- сумма в рублях, как services.price
  currency text not null default 'RUB',
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  idempotence_key text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists tips_profile_id_idx on tips(profile_id);
create index if not exists tips_booking_id_idx on tips(booking_id);
create index if not exists tips_provider_payment_id_idx on tips(provider_payment_id);

alter table tips enable row level security;

-- Мастер видит только свои чаевые. Создание и обновление статуса идёт через
-- сервис-роль (анонимный клиент платит без сессии, вебхук тоже без сессии),
-- поэтому политики insert/update мастеру не нужны — только select.
drop policy if exists "Owners can view own tips" on tips;
create policy "Owners can view own tips" on tips
for select
using (
  exists (
    select 1 from profiles
    where profiles.id = tips.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);
