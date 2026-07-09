-- Настраиваемая предоплата по услугам (Модуль 2 из okno-tz-rating-prepayment.md).
-- Термины ТЗ адаптированы под реальную схему: appointments -> bookings,
-- services остаётся services (совпадает), masters -> profiles.

alter table services
  add column if not exists prepayment_type text
  check (prepayment_type in ('none', 'fixed', 'percent'))
  not null default 'none';

alter table services
  add column if not exists prepayment_value numeric not null default 0;
  -- fixed: сумма в рублях. percent: 0-100, считается от services.price.

-- Снэпшот на момент создания записи: было ли требование предоплаты активно.
-- Не пересчитывается задним числом, если мастер позже меняет настройки
-- услуги — иначе сломалась бы история старых записей.
alter table bookings
  add column if not exists prepayment_required boolean not null default false;

create table if not exists prepayments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded', 'expired'))
    default 'pending',
  provider text not null default 'yookassa',
  provider_payment_id text unique,
  confirmation_url text,
  idempotence_key text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists idx_prepayments_booking on prepayments(booking_id);
create index if not exists idx_prepayments_profile on prepayments(profile_id);
create index if not exists idx_prepayments_provider_id on prepayments(provider_payment_id);
create index if not exists idx_prepayments_status_expires
  on prepayments(status, expires_at);

alter table prepayments enable row level security;

-- Мастер видит и создаёт предоплаты по своим bookings. Подтверждение статуса
-- делает вебхук через сервис-роль (обходит RLS) — так же, как
-- subscription_payments в 202606180002_pro_subscription.sql.
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

-- Слот на время ожидания предоплаты (bookings.status = 'pending_payment')
-- должен занимать время в расписании так же, как confirmed — иначе клиент,
-- открывший оплату, но еще не оплативший, не защищён от двойной записи
-- (ТЗ 2.3: "другие клиенты не должны видеть слот свободным"). Расширяем
-- constraint и обе RPC-проверки конфликтов на pending_payment.
alter table if exists bookings
drop constraint if exists bookings_no_overlap_excl;

alter table if exists bookings
add constraint bookings_no_overlap_excl
exclude using gist (
  profile_id with =,
  tstzrange(starts_at, busy_until, '[)') with &&
)
where (status in ('confirmed', 'pending_payment'));

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
      and p_candidate_start < ends_at + make_interval(mins => greatest(p_buffer_minutes, 0))
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
      and p_candidate_start < ends_at + make_interval(mins => greatest(p_buffer_minutes, 0))
      and p_candidate_busy_end > starts_at

    union all

    select 1
    from blocked_slots
    where profile_id = p_profile_id
      and p_candidate_start < ends_at
      and p_candidate_busy_end > starts_at
  );
$$;
