-- Подарочные сертификаты. Клиент покупает сертификат на странице мастера,
-- оплата — через ЮKassa (тот же паттерн, что и subscription_payments):
-- источник истины по статусу оплаты — сам ЮKassa, вебхук переспрашивает
-- платёж через API и только тогда переводит сертификат в active.
--
-- Код сертификата генерируется криптографически случайным (см.
-- src/lib/gift-certificates.ts, randomBytes), не Math.random().
create table if not exists gift_certificates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  code text not null unique,
  amount integer not null check (amount > 0), -- сумма в рублях, как services.price
  service_id uuid references services(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'active', 'redeemed', 'expired', 'canceled')),
  purchaser_contact text not null default '',
  provider text not null default 'yookassa',
  provider_payment_id text unique,
  idempotence_key text not null,
  redeemed_at timestamptz,
  redeemed_booking_id uuid references bookings(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gift_certificates_profile_id_idx
on gift_certificates(profile_id);

create index if not exists gift_certificates_code_idx
on gift_certificates(code);

create index if not exists gift_certificates_provider_payment_id_idx
on gift_certificates(provider_payment_id);

alter table gift_certificates enable row level security;

-- Мастер видит и управляет своими сертификатами. Публичная покупка и
-- обработка вебхука идут через сервис-роль (обходит RLS), поэтому отдельной
-- политики для клиента-покупателя не нужно — так же, как с bookings/clients.
drop policy if exists "Owners can manage own gift certificates" on gift_certificates;
create policy "Owners can manage own gift certificates" on gift_certificates
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = gift_certificates.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = gift_certificates.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);
