-- Закрывает самоповышение прав через открытый наружу PostgREST
-- (/supabase/rest/v1). Политики «Owners can manage own …» объявлены FOR ALL,
-- а у ролей anon и authenticated стоял полный набор прав на таблицы, поэтому
-- залогиненный мастер мог запросом мимо сайта править в своих строках что
-- угодно: subscription_until и subscription_paid_seats (бесплатный тариф),
-- account_role и workspace_id (доступ в чужую студию), email (по нему
-- определяется админ платформы), а в subscription_payments — срок и план
-- ещё не оплаченного платежа.
--
-- Политики не трогаем: чтение своих строк остаётся как было. Ограничиваем
-- права самих ролей — их RLS не обходит. Сервисная роль (service_role), через
-- которую пишет серверный код, этими ограничениями не затронута.

-- 1. profiles: под сессией мастера меняются только настройки профиля и записи.
--    Список — ровно те колонки, которые пишут под сессией
--    src/app/actions/settings.ts и src/app/actions/free-windows.ts. Тариф,
--    роль, рабочее пространство, email, username, автоплатёж, реферальные
--    поля и фирменный стиль пишет только сервер сервисным клиентом.
--    Новая колонка профиля по умолчанию под сессией не редактируется:
--    если её должен менять сам мастер, добавь её сюда новой миграцией.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;

grant update (
  full_name,
  specialty,
  bio,
  location_text,
  timezone,
  address,
  avatar_url,
  portfolio_works,
  booking_window_days,
  slot_interval_minutes,
  cancellation_notice_hours,
  client_reminder_hours,
  master_reminder_hours,
  booking_theme_preset,
  booking_page_settings,
  hot_windows_discount_percent,
  hot_windows_discount_until
) on public.profiles to authenticated;

-- 2. Таблицы, которые под сессией мастера только читаются: платежи, карты
--    автоплатежа, аккаунт ЮKassa, предоплаты, сертификаты, привязки Telegram,
--    фирменный стиль, шаблоны сертификатов, напоминания о возврате клиентов.
--    Всё это пишет сервер после своих проверок (оплата, лимиты тарифа).
revoke insert, update, delete, truncate on
  public.subscription_payments,
  public.subscription_payment_methods,
  public.master_yookassa_accounts,
  public.prepayments,
  public.gift_certificates,
  public.auth_telegram_links,
  public.brand_themes,
  public.certificate_templates,
  public.client_return_reminders
from anon, authenticated;

-- 3. Админ платформы сверяется по email в нижнем регистре
--    (src/lib/admin/access.ts), а уникальность email была регистрозависимой:
--    «Admin@…» и «admin@…» считались разными адресами. Запрещаем дубли без
--    учёта регистра.
create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email));
