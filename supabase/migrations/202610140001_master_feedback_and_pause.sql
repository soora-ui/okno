-- Обратная связь от мастеров и пауза подписки.
--
-- Всё, что мастер говорит о сервисе, складывается в одну таблицу — идея из
-- кабинета, причина отключения автопродления, ответ на опрос в конце
-- пробного периода, ответ на «расстроишься, если okno исчезнет?». Разные
-- поводы, но разбирает их один человек в одном списке админки, и ценность
-- как раз в том, чтобы видеть их рядом: «не хватает онлайн-оплаты» из
-- отмены и та же просьба из идей — это одна задача, а не две.
--
-- Пауза — отдельная механика биллинга, но живёт здесь же, потому что
-- появилась как ответ на причину отмены «сезон / нет клиентов».

begin;

create table if not exists master_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  -- Повод. idea и bug мастер пишет сам; остальные — ответы на наши вопросы.
  kind text not null check (kind in (
    'idea',
    'bug',
    'cancel',
    'trial_ending',
    'trial_ended',
    'pulse'
  )),
  -- Где оставлен ответ: в кабинете или кнопкой в боте.
  channel text not null default 'site' check (channel in ('site', 'telegram')),
  -- Код причины из фиксированного списка (src/lib/feedback/config.ts). Для
  -- pulse — ответ на вопрос Эллиса: very / somewhat / not.
  reason text,
  message text not null default '',
  -- Где мастер был и в каком состоянии подписки: страница, устройство,
  -- тариф. Чтобы не переспрашивать «а где это было?».
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new'
    check (status in ('new', 'planned', 'done', 'declined')),
  -- Ответ админа мастеру. Уходит в Telegram, если он подключён; иначе ждёт
  -- в кабинете на странице обратной связи.
  admin_reply text,
  reply_sent_at timestamptz,
  reply_channel text check (reply_channel in ('telegram', 'site')),
  -- Мастер увидел ответ в кабинете. Пока пусто — колокольчик напоминает.
  reply_seen_at timestamptz,
  -- Мастер нажал причину в боте, и бот ждёт подробностей следующим
  -- сообщением. После этого срока обычный текст снова уходит в меню бота.
  awaiting_text_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists master_feedback_created_idx
on master_feedback(created_at desc);

create index if not exists master_feedback_profile_idx
on master_feedback(profile_id, created_at desc);

create index if not exists master_feedback_awaiting_idx
on master_feedback(profile_id, awaiting_text_until)
where awaiting_text_until is not null;

-- Журнал показанных опросов. Нужен для двух вещей: не спросить одно и то же
-- дважды (unique по ключу) и не спрашивать чаще раза в 45 дней вообще.
-- prompt_key — повод и его цикл: 'trial_ending', 'trial_ended', 'pulse:3'.
create table if not exists feedback_prompts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  prompt_key text not null,
  channel text not null check (channel in ('site', 'telegram')),
  shown_at timestamptz not null default now(),
  answered_at timestamptz,
  dismissed_at timestamptz,
  unique (profile_id, prompt_key)
);

create index if not exists feedback_prompts_profile_idx
on feedback_prompts(profile_id, shown_at desc);

-- Пауза подписки. На старте паузы subscription_until сдвигается вперёд на
-- длину паузы — оплаченные дни замораживаются, а не сгорают. Автопродление
-- смотрит на subscription_until и поэтому само молчит до конца паузы.
alter table profiles
  add column if not exists subscription_paused_until timestamptz;

create table if not exists subscription_pauses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  planned_until timestamptz not null,
  -- Фактический конец: раньше planned_until, если мастер вернулся сам.
  ended_at timestamptz,
  -- Напомнили ли в Telegram, что пауза заканчивается.
  ending_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscription_pauses_profile_idx
on subscription_pauses(profile_id, started_at desc);

create index if not exists subscription_pauses_open_idx
on subscription_pauses(planned_until)
where ended_at is null;

-- Всё обслуживает серверный код под сервис-ролью, прямого доступа снаружи нет.
alter table master_feedback enable row level security;
alter table feedback_prompts enable row level security;
alter table subscription_pauses enable row level security;

commit;

-- Откат:
-- begin;
-- drop table if exists subscription_pauses;
-- alter table profiles drop column if exists subscription_paused_until;
-- drop table if exists feedback_prompts;
-- drop table if exists master_feedback;
-- commit;
