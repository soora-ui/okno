-- Обращения AI-поддержки, переданные живому оператору.
--
-- Бот отвечает по карте сервиса и обязан выбрать один из исходов. Когда
-- ответа в карте нет — частный случай аккаунта, спорная или денежная
-- ситуация — вопрос уходит в Telegram-группу поддержки, а мастер ждёт ответа
-- в том же чате. Эта таблица — единственное место, где живёт связь между
-- сообщением в группе и ждущим виджетом.
--
-- Персональных данных в группу не уходит: оператор видит вопрос, черновик и
-- короткий код. Кто спросил — смотрится по коду в админке. Так согласие на
-- обработку ПДн не приходится расширять новой целью для Telegram.

begin;

create table if not exists support_escalations (
  id uuid primary key default gen_random_uuid(),
  -- Короткий код для оператора: его видно в группе и по нему обращение
  -- ищется в админке. Отдельно от id, потому что uuid в чат не вставишь.
  code text not null unique,
  profile_id uuid not null references profiles(id) on delete cascade,
  question text not null,
  -- Что бот собирался ответить сам. Оператору так быстрее: чаще всего
  -- достаточно поправить формулировку, а не сочинять ответ с нуля.
  draft_answer text not null,
  summary text not null,
  status text not null default 'pending'
    check (status in ('pending', 'answered')),
  -- Ответ оператора слово в слово, до причёсывания моделью.
  operator_reply text,
  -- Что в итоге увидел мастер. Хранится отдельно: модель приводит ответ к
  -- формату поддержки, и если она переврала смысл, разбираться придётся по
  -- обоим текстам сразу.
  delivered_reply text,
  telegram_message_id bigint,
  -- Когда группе напомнили про висящее обращение. Пустое — ещё не напоминали.
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

-- Главный горячий путь: пришёл reply из группы — найти обращение по
-- message_id сообщения бота. Частичный индекс, потому что отвеченные строки
-- в этом поиске не участвуют.
create index if not exists support_escalations_message_idx
on support_escalations(telegram_message_id)
where status = 'pending';

-- Для фоновой job: кому пора напомнить и что пора удалять по сроку хранения.
create index if not exists support_escalations_status_idx
on support_escalations(status, created_at);

-- Виджет ходит за статусом через API-роут под сессией мастера, админка — под
-- сервис-ролью. Прямого доступа с клиента нет, поэтому RLS без политик,
-- как у telegram_link_tokens.
alter table support_escalations enable row level security;

commit;

-- Откат:
-- begin;
-- drop index if exists support_escalations_status_idx;
-- drop index if exists support_escalations_message_idx;
-- drop table if exists support_escalations;
-- commit;
