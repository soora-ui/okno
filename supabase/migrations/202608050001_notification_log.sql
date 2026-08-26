-- Журнал транзакционной почты (Unisender Go).
--
-- HTTP 200 от email/send.json означает только «принято в очередь». Реальная
-- судьба письма приходит вебхуками, поэтому одна строка живёт долго: сначала
-- queued при отправке, потом sent → delivered → opened → clicked по мере
-- событий.
--
-- Порядок вебхуков не гарантирован: delivered легко прилетает после opened.
-- Отсюда веса статусов и функция record_notification_event — статус движется
-- только вперёд, а поздний вебхук со старым событием не откатывает журнал.

begin;

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  -- job_id возвращает email/send.json, по нему же приходят вебхуки. Пусто
  -- только у писем, которые API не принял вовсе (status = 'failed').
  job_id text,
  -- Идентификатор письма на стороне провайдера, если однажды понадобится:
  -- вебхук transactional_email_status его не присылает, колонка на вырост.
  message_id text,
  recipient text not null,
  email_type text not null,
  subject text,
  status text not null,
  error_message text,
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  -- event_time последнего ПРИМЕНЁННОГО события (UTC, из вебхука). Нужен, чтобы
  -- различать порядок у статусов одного веса — unsubscribed и subscribed
  -- переключают друг друга в обе стороны, весом их не развести.
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_log_status_check check (
    status in (
      'queued',
      'failed',
      'accepted',
      'sent',
      'soft_bounced',
      'delivered',
      'opened',
      'clicked',
      'unsubscribed',
      'subscribed',
      'spam',
      'hard_bounced'
    )
  )
);

create index if not exists notification_log_recipient_idx on notification_log (recipient);
create index if not exists notification_log_job_id_idx on notification_log (job_id);
create index if not exists notification_log_created_at_idx on notification_log (created_at desc);
create index if not exists notification_log_status_idx on notification_log (status);

-- Пара (job_id, recipient) — то, чем вебхук находит свою строку. Уникальность
-- делает апсерт атомарным: событие, обогнавшее запись при отправке, создаёт
-- строку само, а не плодит дубль.
create unique index if not exists notification_log_job_recipient_idx
on notification_log (job_id, recipient)
where job_id is not null;

alter table notification_log enable row level security;

-- Политик нет: пишет и читает только сервисная роль (серверные роуты и
-- скрипты). Политику на чтение из админки добавим отдельной миграцией, когда
-- появится роль админа в БД.

-- Вес статуса: чем позже событие в жизненном цикле письма, тем больше число.
-- soft_bounced стоит между sent и delivered намеренно — это временная
-- недоставка, Unisender Go двое суток пробует снова и письмо ещё может стать
-- delivered.
create or replace function notification_status_weight(p_status text)
returns integer
language sql
immutable
as $$
  select case p_status
    when 'queued' then 0
    when 'failed' then 5
    when 'accepted' then 10
    when 'sent' then 20
    when 'soft_bounced' then 25
    when 'delivered' then 30
    when 'opened' then 40
    when 'clicked' then 50
    when 'unsubscribed' then 60
    when 'subscribed' then 60
    when 'spam' then 90
    when 'hard_bounced' then 90
    else -1
  end;
$$;

-- Единственная точка записи в журнал: и отправка, и вебхук зовут её же.
-- Внутри одного оператора, потому что иначе «прочитать статус → сравнить веса
-- → обновить» превращается в гонку между параллельными вебхуками.
--
-- Описательные поля (email_type, subject, user_id, metadata) дозаполняются
-- всегда, даже когда статус не меняется: строку мог создать вебхук, который
-- про тему письма ничего не знает.
create or replace function record_notification_event(
  p_job_id text,
  p_recipient text,
  p_status text,
  p_email_type text default null,
  p_subject text default null,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_user_id uuid default null,
  p_event_at timestamptz default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_status text;
  v_last_event_at timestamptz;
  v_apply boolean;
begin
  insert into notification_log (
    job_id,
    recipient,
    email_type,
    subject,
    status,
    error_message,
    metadata,
    user_id,
    last_event_at
  )
  values (
    p_job_id,
    p_recipient,
    coalesce(p_email_type, 'unknown'),
    p_subject,
    p_status,
    p_error_message,
    coalesce(p_metadata, '{}'::jsonb),
    p_user_id,
    p_event_at
  )
  on conflict (job_id, recipient) where job_id is not null do nothing
  returning id into v_id;

  -- Строки не было — вставили, и её статус уже наш. Сравнивать не с чем.
  if v_id is not null then
    return v_id;
  end if;

  -- for update: параллельный вебхук по этой же строке подождёт, иначе два
  -- события успевают прочитать один и тот же старый статус и оба «побеждают».
  select id, status, last_event_at
  into v_id, v_status, v_last_event_at
  from notification_log
  where job_id = p_job_id and recipient = p_recipient
  for update;

  v_apply :=
    -- Окончательные приговоры применяем всегда: жалоба на спам и hard_bounce
    -- важнее любого «прочитано», в каком бы порядке события ни пришли.
    p_status in ('spam', 'hard_bounced')
    or notification_status_weight(p_status) > notification_status_weight(v_status)
    -- Отписка и повторная подписка ходят туда-обратно, у них одинаковый вес.
    -- Побеждает то событие, которое случилось позже по времени провайдера.
    or (
      p_status in ('unsubscribed', 'subscribed')
      and (v_last_event_at is null or p_event_at > v_last_event_at)
    );

  update notification_log set
    -- Описательные поля дозаполняются всегда, даже когда статус не меняется:
    -- строку мог создать вебхук, который про тему письма ничего не знает.
    email_type = case
      when email_type = 'unknown' then coalesce(p_email_type, email_type)
      else email_type
    end,
    subject = coalesce(subject, p_subject),
    user_id = coalesce(user_id, p_user_id),
    metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
    error_message = coalesce(p_error_message, error_message),
    status = case when v_apply then p_status else status end,
    -- Время двигается только вместе со статусом. Иначе опоздавшее событие с
    -- низким весом (его отбросили) сдвинет отметку вперёд и следующая
    -- настоящая отписка проиграет тайбрейк несуществующему событию.
    last_event_at = case
      when v_apply then greatest(last_event_at, p_event_at)
      else last_event_at
    end
  where id = v_id;

  return v_id;
end;
$$;

revoke execute on function record_notification_event(
  text, text, text, text, text, text, jsonb, uuid, timestamptz
) from public, anon, authenticated;

grant execute on function record_notification_event(
  text, text, text, text, text, text, jsonb, uuid, timestamptz
) to service_role;

create or replace function notification_log_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notification_log_updated_at on notification_log;
create trigger notification_log_updated_at
before update on notification_log
for each row
execute function notification_log_touch_updated_at();

commit;

-- Откат:
-- begin;
-- drop trigger if exists notification_log_updated_at on notification_log;
-- drop function if exists notification_log_touch_updated_at();
-- drop function if exists record_notification_event(
--   text, text, text, text, text, text, jsonb, uuid, timestamptz
-- );
-- drop function if exists notification_status_weight(text);
-- drop table if exists notification_log;
-- commit;
