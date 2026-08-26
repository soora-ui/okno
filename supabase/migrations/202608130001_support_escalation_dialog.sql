-- Короткий диалог с оператором поверх обращений в поддержку.
--
-- Первая версия закрывала обращение первым же ответом оператора. На практике
-- оператор часто отвечает вопросом («а на какой почте аккаунт?»), и мастер
-- получал этот вопрос как окончательный ответ поддержки — ответить было
-- некуда. Теперь обращение остаётся открытым, и следующая реплика мастера
-- уходит в ту же ветку в группе.
--
-- Окно живёт от последнего сообщения любой из сторон, а не от создания:
-- пока разговор идёт, он не должен закрыться по таймеру посреди фразы.

begin;

alter table support_escalations
  -- Последнее сообщение любой из сторон. По нему считается, жив ли ещё
  -- диалог.
  add column if not exists last_message_at timestamptz not null default now(),
  -- Обращение закрыто: истекло окно либо мастер сменил тему. Закрытое
  -- обращение больше не принимает реплики и не ищется как открытое.
  add column if not exists closed_at timestamptz;

-- Поиск открытого обращения мастера идёт перед КАЖДЫМ ответом залогиненному
-- пользователю, поэтому индекс частичный: закрытые строки в этом запросе не
-- участвуют, а их со временем станет большинство.
create index if not exists support_escalations_open_idx
on support_escalations(profile_id, last_message_at desc)
where closed_at is null;

-- Лимит обращений в час считается по этому же полю у всех строк мастера,
-- включая закрытые.
create index if not exists support_escalations_profile_created_idx
on support_escalations(profile_id, created_at desc);

commit;

-- Откат:
-- begin;
-- drop index if exists support_escalations_profile_created_idx;
-- drop index if exists support_escalations_open_idx;
-- alter table support_escalations
--   drop column if exists closed_at,
--   drop column if exists last_message_at;
-- commit;
