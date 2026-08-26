-- Автопродление подписки мастера: привязка карты при оплате тарифа и
-- последующие списания без участия мастера.
--
-- Ключевое ограничение ЮKassa: удалить сохранённый способ оплаты на их
-- стороне нельзя — API такого метода не даёт. «Отвязать карту» означает
-- удалить привязку у себя и перестать по ней списывать, поэтому источник
-- истины по согласию мастера — эта таблица и profiles.autopay_enabled, а не
-- ЮKassa.

begin;

-- Привязанные карты. Хранится только идентификатор способа оплаты у ЮKassa и
-- маска для показа мастеру — номер карты к нам не попадает вообще.
--
-- Строки здесь не архивируются, а удаляются: политика конфиденциальности
-- обещает мастеру, что при отключении автопродления сведения о карте
-- удаляются, и наличие строки должно означать ровно одно — привязка живая.
-- След в истории оставляет audit_logs, а не эта таблица.
create table if not exists subscription_payment_methods (
  id uuid primary key default gen_random_uuid(),
  -- Привязка у мастера ровно одна: оплата новой картой заменяет предыдущую,
  -- а гонка двух вебхуков упирается в unique, а не создаёт вторую карту.
  profile_id uuid not null unique references profiles(id) on delete cascade,
  provider text not null default 'yookassa',
  provider_payment_method_id text not null,
  card_last4 text,
  card_type text,
  card_expiry_month text,
  card_expiry_year text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscription_payment_methods enable row level security;

-- Та же политика, что у subscription_payments: мастер распоряжается своими
-- привязками, вебхук и фоновая job работают через service role в обход RLS.
drop policy if exists "Owners can manage own subscription payment methods"
  on subscription_payment_methods;
create policy "Owners can manage own subscription payment methods"
on subscription_payment_methods
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = subscription_payment_methods.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = subscription_payment_methods.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);

-- Согласие мастера на автосписание и состояние ретраев.
alter table profiles
  add column if not exists autopay_enabled boolean not null default false,
  add column if not exists autopay_plan text,
  add column if not exists autopay_failed_attempts integer not null default 0,
  add column if not exists autopay_last_attempt_at timestamptz,
  add column if not exists autopay_next_attempt_at timestamptz,
  -- Когда мастеру ушло предупреждение «через 3 дня спишем столько-то».
  -- Сбрасывается в null при каждом успешном продлении, поэтому одно
  -- предупреждение на период, а не одно на всю жизнь подписки.
  add column if not exists autopay_reminder_sent_at timestamptz;

-- Тариф, который продлеваем. Тот же набор значений, что и в
-- profiles.subscription_tier, но без 'free': нечего продлевать.
alter table profiles
  drop constraint if exists profiles_autopay_plan_check;

alter table profiles
  add constraint profiles_autopay_plan_check
  check (autopay_plan is null or autopay_plan in ('solo-basic', 'solo-plus', 'studio'));

-- Выборка фоновой job: кому пора списывать. Частичный индекс — автопродление
-- включено у меньшинства профилей, полный индекс тут не нужен.
create index if not exists profiles_autopay_due_idx
on profiles (subscription_until)
where autopay_enabled;

-- Чем платёж отличается от ручного и какой картой проведён.
-- payment_method_id обнуляется вместе с удалением привязки: платёж остаётся в
-- истории, а сведения о карте — нет.
alter table subscription_payments
  add column if not exists is_recurring boolean not null default false,
  add column if not exists payment_method_id uuid
    references subscription_payment_methods(id) on delete set null;

-- Защита от двойного списания. У ручной оплаты ключ случайный (randomUUID),
-- у автосписания — детерминированный ('r:{profileId}:{дата, от которой
-- продлеваем}:{номер попытки}', см. buildRenewalIdempotenceKey), поэтому два
-- параллельных прогона cron упрутся в этот индекс: второй insert упадёт, и
-- второго платежа в ЮKassa не будет.
--
-- ВНИМАНИЕ: если в subscription_payments уже есть дубликаты idempotence_key,
-- создание индекса упадёт. Проверить до прогона:
--   select idempotence_key, count(*) from subscription_payments
--   group by 1 having count(*) > 1;
create unique index if not exists subscription_payments_idempotence_key_idx
on subscription_payments(idempotence_key);

commit;

-- Откат:
-- begin;
-- drop index if exists subscription_payments_idempotence_key_idx;
-- alter table subscription_payments
--   drop column if exists payment_method_id,
--   drop column if exists is_recurring;
-- drop index if exists profiles_autopay_due_idx;
-- alter table profiles drop constraint if exists profiles_autopay_plan_check;
-- alter table profiles
--   drop column if exists autopay_reminder_sent_at,
--   drop column if exists autopay_next_attempt_at,
--   drop column if exists autopay_last_attempt_at,
--   drop column if exists autopay_failed_attempts,
--   drop column if exists autopay_plan,
--   drop column if exists autopay_enabled;
-- drop table if exists subscription_payment_methods;
-- commit;
