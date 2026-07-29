-- Расширение подарочных сертификатов (okno-tz-certificates.md): визуальный
-- A5-шаблон через Claude API, QR-верификация, частичное списание.
--
-- Решение: расширяем gift_certificates новыми колонками вместо отдельной
-- таблицы certificates из черновой схемы ТЗ — тот же покупатель/вебхук/RLS,
-- дублировать незачем. `code` (уже есть) выполняет роль `cert_number` из
-- ТЗ, отдельную колонку не заводим.
--
-- Терминальный статус для полного списания остаётся `redeemed` (как и
-- раньше) — не добавляем отдельный `used`, чтобы не мигрировать данные и
-- не заводить два лейбла в UI ради синонима из ТЗ. И "полное списание в
-- один вызов" (сканирование QR), и "остаток дошёл до нуля через частичные
-- списания" считаются одним и тем же терминальным статусом.

create table if not exists certificate_templates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  html_source text not null,
  primary_color text not null,
  secondary_color text not null,
  logo_path text,
  studio_name text not null default '',
  tagline text not null default '',
  contacts text not null default '',
  -- Лимит 3 регенерации на аккаунт мастера, жёсткий потолок (см. ТЗ 2.1).
  -- Одна строка на мастера (profile_id unique) и регенерация — это UPDATE,
  -- поэтому счётчик переживает регенерации, а не сбрасывается.
  regeneration_count integer not null default 0 check (regeneration_count <= 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table certificate_templates enable row level security;

drop policy if exists "Owners can manage own certificate templates" on certificate_templates;
create policy "Owners can manage own certificate templates" on certificate_templates
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = certificate_templates.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = certificate_templates.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);

-- Расширение gift_certificates: остаток для частичного списания, хэш
-- токена QR-верификации (сырой токен в БД не хранится — он существует
-- только в URL, см. certificate-verification.ts), ссылка на шаблон, по
-- которому рендерится PDF. PDF не кэшируется в сторадже — рендер через
-- satori/resvg дешёвый и детерминированный, проще рендерить по запросу
-- (/api/certificates/[id]/download), чем городить приватный бакет только
-- ради файла, который и так восстанавливается за миллисекунды.
alter table gift_certificates
  add column if not exists remaining_amount integer,
  add column if not exists token_hash text,
  add column if not exists template_id uuid references certificate_templates(id) on delete set null;

update gift_certificates
set remaining_amount = amount
where remaining_amount is null;

alter table gift_certificates
  alter column remaining_amount set not null,
  alter column remaining_amount set default 0;

alter table gift_certificates
  drop constraint if exists gift_certificates_remaining_amount_check;
alter table gift_certificates
  add constraint gift_certificates_remaining_amount_check
  check (remaining_amount >= 0 and remaining_amount <= amount);

create index if not exists gift_certificates_token_hash_idx
on gift_certificates(token_hash);

-- Аудит списаний (append-only): и сканирование мастером, и списание кодом
-- при онлайн-записи пишут сюда через service-role, чтобы у остатка была
-- единая история независимо от канала.
create table if not exists certificate_redemptions (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references gift_certificates(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  amount_written_off integer not null check (amount_written_off > 0),
  balance_after integer not null check (balance_after >= 0),
  channel text not null check (channel in ('master_scan', 'public_booking')),
  redeemed_by_master_id uuid references profiles(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists certificate_redemptions_certificate_id_idx
on certificate_redemptions(certificate_id);

create index if not exists certificate_redemptions_profile_id_idx
on certificate_redemptions(profile_id);

alter table certificate_redemptions enable row level security;

drop policy if exists "Owners can view own certificate redemptions" on certificate_redemptions;
create policy "Owners can view own certificate redemptions" on certificate_redemptions
for select
using (
  exists (
    select 1 from profiles
    where profiles.id = certificate_redemptions.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);
-- Запись — только через service-role (вебхук/API списания), поэтому
-- отдельной insert-политики для клиента не нужно, как и у gift_certificates.

-- Атомарное частичное списание одним UPDATE — WHERE-условие само защищает
-- от гонки двух одновременных списаний одного сертификата (ни строка
-- пользователем PostgREST/JS не читается заранее). Используется и
-- сканированием мастера (/api/certificates/redeem), и кодом сертификата
-- при онлайн-записи (/api/bookings) — общий путь списания для обоих
-- каналов, дальше они расходятся только записью в certificate_redemptions
-- (channel).
create or replace function redeem_gift_certificate(
  p_certificate_id uuid,
  p_write_off_amount integer
)
returns table (
  id uuid,
  profile_id uuid,
  remaining_amount integer,
  status text
)
language plpgsql
as $$
begin
  return query
  update gift_certificates
  set
    remaining_amount = gift_certificates.remaining_amount - p_write_off_amount,
    status = case
      when gift_certificates.remaining_amount - p_write_off_amount = 0 then 'redeemed'
      else gift_certificates.status
    end,
    redeemed_at = case
      when gift_certificates.remaining_amount - p_write_off_amount = 0 then now()
      else gift_certificates.redeemed_at
    end,
    updated_at = now()
  where gift_certificates.id = p_certificate_id
    and gift_certificates.status = 'active'
    and gift_certificates.remaining_amount >= p_write_off_amount
    and p_write_off_amount > 0
  returning
    gift_certificates.id,
    gift_certificates.profile_id,
    gift_certificates.remaining_amount,
    gift_certificates.status;
end;
$$;
