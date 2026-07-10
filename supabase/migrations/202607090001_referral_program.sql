-- Реферальная программа мастеров: за каждого приглашённого, оплатившего
-- первый месяц PRO, пригласивший получает +30 дней PRO (см. src/lib/subscription.ts
-- и вебхук ЮKassa, который и продлевает subscription_until).

alter table if exists profiles
add column if not exists referral_code text;

alter table if exists profiles
add column if not exists referred_by uuid references profiles(id) on delete set null;

-- Уникальность кода обеспечиваем частичным индексом (а не constraint), чтобы
-- профили без кода (созданные до миграции) не конфликтовали друг с другом.
create unique index if not exists profiles_referral_code_key
on profiles(referral_code)
where referral_code is not null;

create index if not exists profiles_referred_by_idx
on profiles(referred_by);

-- Начисления бонусов по рефералам. status:
--   pending — приглашённый зарегистрировался, но ещё не оплатил первый месяц;
--   applied — бонус начислен пригласившему (продление subscription_until).
create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_profile_id uuid not null references profiles(id) on delete cascade,
  referred_profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'applied')),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (referred_profile_id)
);

create index if not exists referral_rewards_referrer_profile_id_idx
on referral_rewards(referrer_profile_id);

create index if not exists referral_rewards_status_idx
on referral_rewards(status);

alter table referral_rewards enable row level security;

-- Мастер видит только свои начисления (как пригласивший). Запись создаёт и
-- обновляет сервис-роль (регистрация и вебхук ЮKassa обходят RLS).
drop policy if exists "Owners can view own referral rewards" on referral_rewards;
create policy "Owners can view own referral rewards" on referral_rewards
for select
using (
  exists (
    select 1 from profiles
    where profiles.id = referral_rewards.referrer_profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);
