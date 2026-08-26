-- Напоминания клиенту в Telegram: привязка чата к записи.
--
-- Зачем вообще: SMS клиенту не доходят. Проверка 22.08.2026 показала, что у
-- sms.ru нет общего бесплатного отправителя — имя подключается к каждому
-- оператору за абонплату (около 14 700 ₽/мес на всех), а крымское направление
-- вдобавок отдаёт ложный статус «доставлено». Подробности в docs/sms-setup.md.
-- Telegram — единственный канал до клиента с нулевым фиксом, который при этом
-- умеет то, чего не умеет календарь: сообщить об отмене после того, как
-- клиент уже сохранил визит.
--
-- Устройство повторяет мастерскую привязку (202608030001_telegram_bot.sql):
-- сайт знает, чья это запись, Telegram знает, кто пользователь, связывает их
-- одноразовый токен из ссылки t.me/<bot>?start=c_<токен>. Токен уезжает в
-- Telegram открытым текстом, поэтому в базе лежит только его sha256.
--
-- Привязка живёт на записи, а не на человеке. Кросс-мастерской сущности
-- «клиент» в схеме нет: clients привязана к profile_id, телефон зашифрован и
-- по нему не искать. Личный кабинет клиента (мини-апп) потребует
-- детерминированного хеша телефона и отдельной миграции — здесь этого нарочно
-- нет, чтобы напоминания не ждали кабинета.

begin;

create table if not exists telegram_client_link_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_telegram_user_id text,
  created_at timestamptz not null default now()
);

-- Для гашения прошлых невыданных токенов записи при выпуске нового: клиент
-- мог нажать кнопку, передумать и нажать ещё раз.
create index if not exists telegram_client_link_tokens_booking_idx
on telegram_client_link_tokens(booking_id, created_at desc);

-- Обслуживается только сервис-ролью (вебхук бота и роут выдачи ссылки),
-- поэтому RLS без политик — как у telegram_link_tokens.
alter table telegram_client_link_tokens enable row level security;

create table if not exists client_telegram_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  telegram_user_id text not null,
  chat_id text not null,
  handle text,
  linked_at timestamptz not null default now(),
  -- Отписка не удаляет строку: по ней видно, что человек уже отказывался, и
  -- повторно навязываться не нужно. Живой считается строка с unlinked_at null.
  unlinked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Одна запись — один живой чат. Повторное нажатие кнопки перепривязывает, а не
-- плодит дубли; отписанные строки в ограничение не попадают.
create unique index if not exists client_telegram_links_booking_active_idx
on client_telegram_links(booking_id)
where unlinked_at is null;

-- Поиск всех записей чата: на /stop от клиента и на любое его сообщение боту.
-- Один человек может привязать несколько своих записей к разным мастерам —
-- это не идентичность, а просто несколько строк с одним chat_id.
create index if not exists client_telegram_links_chat_idx
on client_telegram_links(chat_id)
where unlinked_at is null;

alter table client_telegram_links enable row level security;

commit;

-- Откат:
-- begin;
-- drop index if exists client_telegram_links_chat_idx;
-- drop index if exists client_telegram_links_booking_active_idx;
-- drop table if exists client_telegram_links;
-- drop index if exists telegram_client_link_tokens_booking_idx;
-- drop table if exists telegram_client_link_tokens;
-- commit;
