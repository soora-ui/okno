-- PRO-подписка мастера. Платит мастер (не клиент): PRO открывает доп-функции,
-- включая AI-консультацию. Оплата — через ЮKassa. Консультация для клиента
-- бесплатна, поэтому отдельной клиентской оплаты здесь нет.

alter table if exists profiles
add column if not exists subscription_until timestamptz;

-- Журнал платежей за подписку. Источник истины по статусу — ЮKassa:
-- вебхук переспрашивает платёж через API и только тогда активирует PRO.
create table if not exists subscription_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null default 'yookassa',
  provider_payment_id text unique,
  plan text not null default 'pro',
  amount integer not null,            -- сумма в рублях (целое, как services.price)
  currency text not null default 'RUB',
  period_days integer not null default 30,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'canceled')),
  idempotence_key text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_payments_profile_id_idx
on subscription_payments(profile_id);

create index if not exists subscription_payments_provider_payment_id_idx
on subscription_payments(provider_payment_id);

alter table subscription_payments enable row level security;

-- Мастер видит и создаёт свои платежи. Подтверждение статуса делает вебхук
-- через сервис-роль (обходит RLS), поэтому отдельной политики для него не нужно.
drop policy if exists "Owners can manage own subscription payments" on subscription_payments;
create policy "Owners can manage own subscription payments" on subscription_payments
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = subscription_payments.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = subscription_payments.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);
