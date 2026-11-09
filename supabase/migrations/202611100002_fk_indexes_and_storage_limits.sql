-- 1. Индексы на внешние ключи, у которых их не было. Без индекса Postgres при
--    удалении или изменении родительской строки (клиент, услуга, профиль)
--    просматривает дочернюю таблицу целиком, а выборки «все записи клиента»
--    и «все записи по услуге» идут последовательным чтением. На нынешних
--    объёмах этого не видно, с ростом bookings станет заметно.
create index if not exists bookings_client_id_idx
  on public.bookings (client_id);
create index if not exists bookings_service_id_idx
  on public.bookings (service_id);
create index if not exists audit_logs_actor_profile_id_idx
  on public.audit_logs (actor_profile_id);
create index if not exists certificate_redemptions_booking_id_idx
  on public.certificate_redemptions (booking_id);
create index if not exists certificate_redemptions_redeemed_by_master_id_idx
  on public.certificate_redemptions (redeemed_by_master_id);
create index if not exists client_return_reminders_profile_id_idx
  on public.client_return_reminders (profile_id);
create index if not exists error_events_profile_id_idx
  on public.error_events (profile_id);
create index if not exists gift_certificates_master_yookassa_account_id_idx
  on public.gift_certificates (master_yookassa_account_id);
create index if not exists gift_certificates_redeemed_booking_id_idx
  on public.gift_certificates (redeemed_booking_id);
create index if not exists gift_certificates_service_id_idx
  on public.gift_certificates (service_id);
create index if not exists gift_certificates_template_id_idx
  on public.gift_certificates (template_id);
create index if not exists nalog_receipts_profile_id_idx
  on public.nalog_receipts (profile_id);
create index if not exists notification_log_user_id_idx
  on public.notification_log (user_id);
create index if not exists prepayments_master_yookassa_account_id_idx
  on public.prepayments (master_yookassa_account_id);
create index if not exists profiles_created_by_profile_id_idx
  on public.profiles (created_by_profile_id);
create index if not exists profiles_disabled_by_profile_id_idx
  on public.profiles (disabled_by_profile_id);
create index if not exists public_booking_idempotency_booking_id_idx
  on public.public_booking_idempotency (booking_id);
create index if not exists subscription_payments_payment_method_id_idx
  on public.subscription_payments (payment_method_id);

-- 2. Суточный потолок платных отправок кода (src/lib/phone-verification.ts)
--    считает строки за последние 24 часа по всем номерам — под это нужен
--    индекс по времени; имеющиеся начинаются с phone_hash и ip_hash.
create index if not exists phone_verification_codes_created_at_idx
  on public.phone_verification_codes (created_at);

-- 3. Публичный бакет profile-media отдаётся с того же домена, что и сайт
--    (okno.business/supabase/storage/…), а грузит в него браузер мастера
--    напрямую. Тип и размер проверялись только в интерфейсе: запросом мимо
--    сайта можно было положить в свою папку, например, HTML-страницу и
--    получить её на домене okno. Ограничиваем на стороне хранилища теми
--    типами, которые сайт действительно загружает (src/lib/profile-media.ts):
--    фото и логотип сертификата. 8 МБ — наибольший из лимитов интерфейса.
update storage.buckets
set
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/svg+xml'
  ],
  file_size_limit = 8 * 1024 * 1024
where id = 'profile-media';
