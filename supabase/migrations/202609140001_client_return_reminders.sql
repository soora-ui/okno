-- Напоминание «давно не были»: мастер из карточки клиента отправляет ему в
-- Telegram сообщение, составленное ИИ по истории визитов.
--
-- Таблица нужна не для очереди (отправка синхронная, из server action), а как
-- память о том, кому и когда уже писали. На ней держится ограничение «не чаще
-- раза в две недели на клиента» — единственная защита от превращения фичи в
-- рассылку — и подпись «напоминали такого-то числа» в карточке.

begin;

create table if not exists client_return_reminders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  chat_id text not null,
  -- Что ушло клиенту и что предлагал ИИ до правок мастера: по разнице видно,
  -- насколько черновики попадают в тон, без похода в логи модели.
  message text not null,
  draft_message text,
  sent_at timestamptz not null default now()
);

-- Последнее напоминание клиенту — проверка перед каждой отправкой.
create index if not exists client_return_reminders_client_sent_idx
on client_return_reminders(client_id, sent_at desc);

alter table client_return_reminders enable row level security;

-- Мастер видит свои напоминания, пишет их server action через сервисную роль.
drop policy if exists "Owners can manage own client return reminders"
  on client_return_reminders;
create policy "Owners can manage own client return reminders"
on client_return_reminders
for all
using (
  exists (
    select 1 from profiles
    where profiles.id = client_return_reminders.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from profiles
    where profiles.id = client_return_reminders.profile_id
      and profiles.password_auth_id = auth.uid()::text
  )
);

commit;

-- Откат:
-- begin;
-- drop table if exists client_return_reminders;
-- commit;
