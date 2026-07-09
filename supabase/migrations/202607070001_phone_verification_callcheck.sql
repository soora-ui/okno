-- Обратный звонок (sms.ru callcheck) как запасной канал подтверждения:
-- у таких проверок нет кода, вместо него храним check_id от sms.ru.
alter table phone_verification_codes
alter column code_hash drop not null;

alter table phone_verification_codes
add column if not exists check_id text;
