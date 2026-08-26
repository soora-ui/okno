-- Оплата тарифа вперёд: 3, 6 или 12 расчётных периодов одним платежом со
-- скидкой. Длина периода уже хранится в subscription_payments.period_days и
-- уже применяется при активации, поэтому доступ продлевается без изменений.
-- Новое здесь — то, что должно пережить сам платёж:
--
--   • каким периодом продлевать по автосписанию (иначе оплативший год мастер
--     через год получил бы списание за месяц и молча потерял скидку);
--   • сколько мест оплачено, чтобы сотрудник, добавленный в середине года,
--     не работал бесплатно до конца оплаченного периода;
--   • чем платёж является — оплатой периода или доплатой за место: доплата
--     денег стоит, но subscription_until не двигает.

begin;

alter table profiles
  -- Длина последнего оплаченного периода в днях. Нужна для доплаты за место
  -- (по ней считается скидка остатка) и для текстов в кабинете. null означает
  -- «оплаты ещё не было» — там, где это важно, читается как 30 дней.
  add column if not exists subscription_period_days integer,
  -- Сколько сотрудников оплачено в текущем периоде. Считается на момент
  -- оплаты, как и раньше; отличие в том, что теперь число сохраняется и с ним
  -- можно сверить фактическую команду посреди периода.
  add column if not exists subscription_paid_seats integer not null default 0,
  -- Каким периодом продлевать. Отдельно от subscription_period_days: мастер
  -- мог оплатить год руками и не включать автопродление вовсе.
  add column if not exists autopay_period_days integer;

-- Разрешены только те длины, которые умеет считать витрина (billingPeriods
-- в src/config/plans.ts). Произвольное число дней здесь означало бы, что
-- цена периода нигде не выводится, а списание всё равно произойдёт.
alter table profiles
  drop constraint if exists profiles_subscription_period_days_check;

alter table profiles
  add constraint profiles_subscription_period_days_check
  check (subscription_period_days is null
    or subscription_period_days in (30, 90, 180, 360));

alter table profiles
  drop constraint if exists profiles_autopay_period_days_check;

alter table profiles
  add constraint profiles_autopay_period_days_check
  check (autopay_period_days is null
    or autopay_period_days in (30, 90, 180, 360));

alter table profiles
  drop constraint if exists profiles_subscription_paid_seats_check;

alter table profiles
  add constraint profiles_subscription_paid_seats_check
  check (subscription_paid_seats >= 0);

-- Вид платежа. 'subscription' — оплата периода, двигает subscription_until.
-- 'seat' — доступ уже оплачен, докупается место до конца текущего периода:
-- срок не меняется, растёт только subscription_paid_seats.
alter table subscription_payments
  add column if not exists kind text not null default 'subscription';

alter table subscription_payments
  drop constraint if exists subscription_payments_kind_check;

alter table subscription_payments
  add constraint subscription_payments_kind_check
  check (kind in ('subscription', 'seat'));

-- Мастера, оплатившие до появления длинных периодов, платили за 30 дней.
-- Проставляем это явно, чтобы автопродление не считало период неизвестным и
-- не сваливалось в умолчание на каждом прогоне.
update profiles
set subscription_period_days = 30
where subscription_period_days is null
  and subscription_until is not null;

update profiles
set autopay_period_days = 30
where autopay_period_days is null
  and autopay_enabled;

commit;

-- Откат:
-- begin;
-- alter table subscription_payments
--   drop constraint if exists subscription_payments_kind_check,
--   drop column if exists kind;
-- alter table profiles
--   drop constraint if exists profiles_subscription_paid_seats_check,
--   drop constraint if exists profiles_autopay_period_days_check,
--   drop constraint if exists profiles_subscription_period_days_check;
-- alter table profiles
--   drop column if exists autopay_period_days,
--   drop column if exists subscription_paid_seats,
--   drop column if exists subscription_period_days;
-- commit;
