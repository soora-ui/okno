-- Приватные отзывы клиента о визите.
--
-- Приватные намеренно. Публичные отзывы — маркетплейсная территория: нужна
-- модерация, право мастера ответить, защита от накрутки и ответ на вопрос,
-- может ли мастер удалить плохой отзыв. Если может — цена отзывам ноль, если
-- нет — мастера уходят. Обратный путь «показывали, теперь спрятали» хуже
-- прямого, поэтому начинаем с приватных: это обратная связь мастеру, а не
-- витрина.
--
-- Один отзыв на визит: оценивают конкретную процедуру, а не мастера вообще.
-- Отсюда unique по booking_id, а не по паре клиент-мастер.
--
-- Клиент правит свой отзыв сколько угодно: он не публичный, и передумать
-- после «поставил пять сгоряча» — нормально. Мастер не правит и не удаляет
-- ничего: отзыв, который можно стереть, перестаёт быть обратной связью.

begin;

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  -- Мастер, которому отзыв. Дублирует booking.profile_id намеренно: лента
  -- отзывов в кабинете читается по нему без джойна на каждой строке.
  profile_id uuid not null references profiles(id) on delete cascade,
  booking_id uuid not null unique references bookings(id) on delete cascade,
  -- Клиент мастера. Нужен блоку отзывов в карточке клиента.
  client_id uuid references clients(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  -- Кто оставил. Телефон не храним, как и везде: по хешу и находим.
  author_phone_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Лента отзывов мастера: свежие сверху.
create index if not exists reviews_profile_idx
on reviews(profile_id, created_at desc);

-- Блок отзывов в карточке клиента.
create index if not exists reviews_client_idx
on reviews(client_id, created_at desc)
where client_id is not null;

-- Кабинет клиента показывает свои отзывы рядом с визитами.
create index if not exists reviews_author_idx
on reviews(author_phone_hash, created_at desc);

-- Обслуживается только сервис-ролью: пишет мини-апп после проверки подписи,
-- читает серверный код кабинета мастера. Прямого доступа снаружи нет.
alter table reviews enable row level security;

commit;

-- Откат:
-- begin;
-- drop index if exists reviews_author_idx;
-- drop index if exists reviews_client_idx;
-- drop index if exists reviews_profile_idx;
-- drop table if exists reviews;
-- commit;
