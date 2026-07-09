-- Коды подтверждения номера телефона перед публичной записью.
-- Таблица обслуживается только сервис-ролью, RLS без политик.
create table if not exists phone_verification_codes (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  code_hash text not null,
  ip_hash text not null default '',
  attempts integer not null default 0,
  verified_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists phone_verification_codes_phone_created_idx
on phone_verification_codes(phone_hash, created_at desc);

create index if not exists phone_verification_codes_ip_created_idx
on phone_verification_codes(ip_hash, created_at desc);

alter table phone_verification_codes enable row level security;
