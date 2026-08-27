-- Личность клиента в Telegram: связка telegram-аккаунта с телефоном.
--
-- Предыдущая миграция (202608260001) привязывала чат к одной записи — этого
-- хватает для напоминания, но не для кабинета: чтобы показать человеку все
-- его визиты, нужно понять, что записи у трёх разных мастеров принадлежат
-- одному и тому же человеку.
--
-- Связывает их clients.phone_hash из 202604050001: он детерминированный
-- (sha256 от секрета и цифр телефона), поэтому у одного человека одинаков в
-- строках clients всех мастеров. Своей строки clients у него при этом не
-- появляется — сущность «клиент» так и остаётся принадлежащей мастеру.
--
-- Телефон приходит от самого Telegram, кнопкой «поделиться контактом»: это
-- единственный способ узнать его достоверно, не заставляя человека вводить
-- номер руками и не доверяя этому вводу. Проверка, что контакт свой, а не
-- переслан за кого-то, — на стороне бота: contact.user_id против from.id.
--
-- Самого телефона здесь нет, только хеш: кабинет по нему ищет, а показывать
-- номер незачем — человек его и так знает.

begin;

create table if not exists client_telegram_identities (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null,
  phone_hash text not null,
  chat_id text not null,
  handle text,
  linked_at timestamptz not null default now(),
  -- Отписка не удаляет строку: по ней видно, что человек уже отказывался, и
  -- навязываться повторно не нужно. Живой считается строка с unlinked_at null.
  unlinked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Один telegram-аккаунт — одна живая личность. Сменил номер и поделился
-- заново: прежняя строка гасится, новая встаёт на её место.
create unique index if not exists client_telegram_identities_user_active_idx
on client_telegram_identities(telegram_user_id)
where unlinked_at is null;

-- Поиск личности по телефону: нужен, чтобы при новой записи понять, что этот
-- человек уже подключал Telegram, и не просить его об этом снова.
create index if not exists client_telegram_identities_phone_idx
on client_telegram_identities(phone_hash)
where unlinked_at is null;

-- Обслуживается только сервис-ролью (вебхук бота и мини-апп), поэтому RLS
-- без политик — как у telegram_client_link_tokens.
alter table client_telegram_identities enable row level security;

commit;

-- Откат:
-- begin;
-- drop index if exists client_telegram_identities_phone_idx;
-- drop index if exists client_telegram_identities_user_active_idx;
-- drop table if exists client_telegram_identities;
-- commit;
