-- Настраиваемый мастером интервал повторного визита по услуге (в неделях).
-- NULL значит "не предлагать напоминание о повторном визите" для этой услуги.
alter table if exists services
add column if not exists repeat_interval_weeks integer;

alter table if exists services
drop constraint if exists services_repeat_interval_weeks_check;

alter table if exists services
add constraint services_repeat_interval_weeks_check
check (repeat_interval_weeks is null or repeat_interval_weeks between 1 and 52);

-- Клиент может согласиться получить напоминание про повторный визит через
-- N недель после текущей записи. Переиспользуем существующую очередь
-- notification_events (тип "sms_repeat_visit_reminder"), поэтому отдельная
-- таблица не нужна — достаточно пометить это согласие на самой записи, чтобы
-- перенос/отмена записи могли снять уже запланированное напоминание.
alter table if exists bookings
add column if not exists repeat_visit_reminder_requested boolean not null default false;
