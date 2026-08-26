-- Telegram-бот мастера: привязка аккаунта к чату.
--
-- До этой миграции отправка в Telegram в коде была, а положить что-то в
-- profiles.telegram_chat_id было нечем — бота не существовало. Здесь
-- появляется недостающее звено: одноразовый токен, которым страница настроек
-- сообщает боту, чей это чат.
--
-- Токен уезжает в Telegram открытым текстом внутри ссылки
-- t.me/<bot>?start=<токен>, поэтому в базе лежит только его sha256: дамп
-- таблицы не даёт привязать чужой аккаунт, а сверять хеш при погашении так же
-- дёшево, как сравнивать сам токен.

begin;

create table if not exists telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_telegram_user_id text,
  created_at timestamptz not null default now()
);

-- Выборка при погашении идёт по token_hash (unique выше), а этот индекс —
-- для гашения прошлых токенов профиля при выпуске нового.
create index if not exists telegram_link_tokens_profile_idx
on telegram_link_tokens(profile_id, created_at desc);

-- Обслуживается только сервис-ролью (вебхук бота и server action настроек),
-- поэтому RLS без политик — как у phone_verification_codes.
alter table telegram_link_tokens enable row level security;

-- auth_telegram_links заведена в первой миграции, но ничем не использовалась.
-- Добавляем то, без чего бот не может ответить в чат и отличить живую
-- привязку от выключенной.
alter table auth_telegram_links
  add column if not exists chat_id text,
  add column if not exists linked_at timestamptz not null default now(),
  -- Отвязка не удаляет строку: мастер жмёт /start в том же чате, и
  -- уведомления включаются обратно без похода в настройки. Источник истины
  -- «слать или нет» — profiles.telegram_chat_id, эта колонка объясняет боту,
  -- что чат знакомый.
  add column if not exists unlinked_at timestamptz,
  add column if not exists last_seen_at timestamptz;

create index if not exists auth_telegram_links_profile_idx
on auth_telegram_links(profile_id);

-- Поиск профиля по входящему апдейту — на каждое сообщение боту.
-- Уникальность частичная: один живой чат обслуживает один профиль, но
-- отвязанные строки в ограничение не попадают.
create unique index if not exists auth_telegram_links_chat_active_idx
on auth_telegram_links(chat_id)
where unlinked_at is null and chat_id is not null;

commit;

-- Откат:
-- begin;
-- drop index if exists auth_telegram_links_chat_active_idx;
-- drop index if exists auth_telegram_links_profile_idx;
-- alter table auth_telegram_links
--   drop column if exists last_seen_at,
--   drop column if exists unlinked_at,
--   drop column if exists linked_at,
--   drop column if exists chat_id;
-- drop table if exists telegram_link_tokens;
-- commit;
