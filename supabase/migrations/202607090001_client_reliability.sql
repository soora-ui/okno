-- Рейтинг надёжности клиентов (Модуль 1 из okno-tz-rating-prepayment.md).
-- Термины ТЗ адаптированы под реальную схему: appointments -> bookings,
-- masters -> profiles (мастер = владелец записи через bookings.profile_id,
-- отдельной таблицы masters в проекте нет).
--
-- Рейтинг приватный: per profile_id (мастер видит статистику только по
-- своим собственным bookings). Глобальный вариант — отдельная фича,
-- см. открытый вопрос 1.4 в ТЗ.

-- Статус визита выставляется мастером вручную постфактум. Независим от
-- bookings.status (confirmed/cancelled_by_client/cancelled_by_master),
-- который описывает жизненный цикл записи, а не то, пришёл ли клиент.
alter table bookings
  add column if not exists visit_status text
  check (visit_status in ('pending', 'completed', 'no_show', 'cancelled_late', 'cancelled_ok'))
  not null default 'pending';

alter table bookings
  add column if not exists visit_status_set_at timestamptz;

create index if not exists bookings_visit_status_idx
  on bookings(profile_id, visit_status);

-- Порог "поздней" отмены в часах до начала визита. Настройка мастера
-- (profiles), а не константа в коде — разные мастера хотят разный порог.
alter table profiles
  add column if not exists late_cancel_threshold_hours integer not null default 24;

-- View с агрегатами надёжности клиента. Пересчитывается на чтении, не
-- требует синхронизации отдельной таблицей.
create or replace view client_reliability as
select
  b.client_id,
  b.profile_id,
  count(*) as total_finished,
  count(*) filter (where b.visit_status = 'completed') as completed,
  count(*) filter (where b.visit_status = 'no_show') as no_shows,
  count(*) filter (where b.visit_status = 'cancelled_late') as late_cancels,
  count(*) filter (where b.visit_status = 'cancelled_ok') as ok_cancels,
  round(
    100.0 * count(*) filter (where b.visit_status = 'completed')
    / greatest(count(*) filter (where b.visit_status in
        ('completed', 'no_show', 'cancelled_late')), 1)
  )::int as reliability_score
from bookings b
where b.visit_status != 'pending'
group by b.client_id, b.profile_id;

-- View наследует права от вызывающей роли (security_invoker), поэтому RLS
-- таблицы bookings (владелец видит только свои записи) продолжает
-- действовать и здесь — рейтинг остаётся приватным per master.
alter view client_reliability set (security_invoker = on);
