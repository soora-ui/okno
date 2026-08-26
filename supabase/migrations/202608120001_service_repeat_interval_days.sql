-- Срок повторного визита переезжает с недель на дни.
--
-- Причина не косметическая. К этому полю подключается AI-консультант: клиент
-- спрашивает «когда можно повторить», и сервис предлагает ближайшее свободное
-- время после срока. Пока срок хранится в неделях, мастер массажа не может
-- выразить «через 5 дней» вообще никак — а именно такие сроки у процедур,
-- которые повторяют часто.
--
-- Второй источник срока (например, разбор фразы из мануала услуги) заводить
-- нельзя: тогда SMS-напоминание считалось бы по одному числу, а бот в чате
-- отвечал по другому, и оба ссылались бы на одного мастера. Поэтому поле
-- остаётся единственным, просто становится точнее.

alter table if exists services
add column if not exists repeat_interval_days integer;

-- Перенос существующих значений. Идемпотентно: заполняем только там, где
-- новое поле ещё пустое, а старое задано.
update services
set repeat_interval_days = repeat_interval_weeks * 7
where repeat_interval_days is null
  and repeat_interval_weeks is not null;

alter table if exists services
drop constraint if exists services_repeat_interval_days_check;

-- Верхняя граница та же, что была (52 недели), нижняя — сутки.
alter table if exists services
add constraint services_repeat_interval_days_check
check (repeat_interval_days is null or repeat_interval_days between 1 and 364);

-- repeat_interval_weeks намеренно оставлена в схеме и не удаляется: на момент
-- миграции в очереди notification_events уже стоят запланированные напоминания,
-- посчитанные по старому полю, и живут они до 52 недель вперёд. Колонку можно
-- будет снять отдельной миграцией, когда очередь опустеет.
