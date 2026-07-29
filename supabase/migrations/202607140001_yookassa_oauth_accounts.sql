-- OAuth-подключение мастеров к ЮKassa Partners API (okno-tz-yookassa-oauth.md).
-- Термины ТЗ адаптированы под реальную схему: masters -> profiles.
--
-- Заменяет предоплату через общий shopId/secretKey платформы (Модуль 2,
-- 202607090002_service_prepayment.sql) на прямые платежи в магазин мастера:
-- деньги идут мастеру, минуя счёт платформы. Область: только предоплата за
-- услугу — чаевые (tips), сертификаты (gift_certificates) и PRO-подписка
-- (subscription_payments) остаются на общем shopId платформы.

create table if not exists master_yookassa_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  yookassa_account_id text not null,
  -- Токен шифруется AES-256-GCM (см. encryptOAuthToken в
  -- src/lib/payments/yookassa-oauth.ts) отдельным секретом
  -- YOOKASSA_OAUTH_TOKEN_ENCRYPTION_SECRET — не хранится в открытом виде.
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  is_test_shop boolean not null default false,
  payment_methods jsonb not null default '[]'::jsonb,
  status text not null check (status in ('enabled', 'disabled', 'revoked')) default 'enabled',
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_master_yookassa_accounts_profile
  on master_yookassa_accounts(profile_id);

alter table master_yookassa_accounts enable row level security;

-- Мастер видит и обновляет только свою запись. Запись/обновление токена при
-- OAuth-коллбэке идёт через RLS-клиент в контексте сессии мастера (коллбэк —
-- обычный редирект браузера, куки сессии на месте), а не через service role.
drop policy if exists "Owners can manage own yookassa account" on master_yookassa_accounts;
create policy "Owners can manage own yookassa account" on master_yookassa_accounts
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = master_yookassa_accounts.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = master_yookassa_accounts.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);

-- Явная привязка предоплаты к аккаунту мастера в ЮKassa, через чей токен она
-- проведена — нужна вебхуку, чтобы перепроверять статус платежа тем же
-- Bearer-токеном, которым платёж был создан (общий shopId платформы для
-- предоплаты больше не используется).
alter table prepayments
  add column if not exists master_yookassa_account_id uuid
  references master_yookassa_accounts(id) on delete set null;
