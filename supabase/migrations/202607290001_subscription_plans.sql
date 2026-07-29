-- Переход с единственной подписки PRO на тарифную сетку из трёх тарифов.
--
-- Было: subscription_tier принимал 'free' | 'pro', лимит записей жил в
-- monthly_booking_limit (и нигде не проверялся).
-- Стало: subscription_tier хранит идентификатор тарифа из src/config/plans.ts
-- ('solo-basic' | 'solo-plus' | 'studio') либо 'free' — «оплаченного тарифа
-- нет». Пробный период считается приложением от profiles.created_at и
-- отдельной колонки не требует.
--
-- ВНИМАНИЕ. Миграция меняет значения у живых пользователей. Прогонять
-- осознанно и после бэкапа: откат ниже возвращает всех платных мастеров
-- в 'pro' и не различает, кто из них был на 'studio'.

begin;

-- 1. Мастера, купившие старую подписку 690 ₽, платили за AI-консультацию и
--    снятие лимита — это состав тарифа «Соло. Расширенный». Переводим их
--    туда, а не в базовый: понижать уже оплаченный доступ нельзя.
update profiles
set subscription_tier = 'solo-plus'
where subscription_tier = 'pro';

-- 2. Всё, что не является известным тарифом, приводим к 'free'.
--    Приложение трактует это как «нет оплаченного тарифа».
update profiles
set subscription_tier = 'free'
where subscription_tier not in ('free', 'solo-basic', 'solo-plus', 'studio');

-- 3. Ограничение на допустимые значения. Раньше колонка была свободным text
--    без constraint, из-за чего опечатка в коде молча ложилась в базу.
alter table profiles
  drop constraint if exists profiles_subscription_tier_check;

alter table profiles
  add constraint profiles_subscription_tier_check
  check (subscription_tier in ('free', 'solo-basic', 'solo-plus', 'studio'));

-- 4. Оплаченный тариф в строке платежа. Значение читает вебхук, чтобы
--    проставлять мастеру именно тот тариф, который он оплатил.
update subscription_payments
set plan = 'solo-plus'
where plan = 'pro';

alter table subscription_payments
  drop constraint if exists subscription_payments_plan_check;

alter table subscription_payments
  add constraint subscription_payments_plan_check
  check (plan in ('solo-basic', 'solo-plus', 'studio'));

-- 5. Индекс под выборку активных подписок: админские метрики фильтруют по
--    паре (tier, until), а раньше на subscription_until индекса не было.
create index if not exists profiles_subscription_idx
  on profiles (subscription_tier, subscription_until);

commit;

-- Колонка monthly_booking_limit намеренно оставлена: лимита записей в новой
-- политике нет, но данные в ней ещё читает старый код отчётов. Удалять
-- отдельной миграцией, когда ссылки уйдут.

-- Откат:
-- begin;
-- alter table profiles drop constraint if exists profiles_subscription_tier_check;
-- alter table subscription_payments drop constraint if exists subscription_payments_plan_check;
-- update profiles set subscription_tier = 'pro'
--   where subscription_tier in ('solo-basic', 'solo-plus', 'studio');
-- update subscription_payments set plan = 'pro'
--   where plan in ('solo-basic', 'solo-plus', 'studio');
-- drop index if exists profiles_subscription_idx;
-- commit;
