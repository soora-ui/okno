-- Автоматические чеки НПД («Мой налог») по платежам магазина платформы.
--
-- ЮKassa закрыла свой сервис пересылки чеков в налоговую для самозанятых,
-- поэтому доход платформы (подписка PRO и доплата за места — всё, что мастер
-- платит нам за сервис) регистрируется в lknpd.nalog.ru нашим кодом:
-- src/lib/nalog/*.
--
-- Деньги клиентов сюда не попадают: предоплата, чаевые и сертификаты идут в
-- магазин ЮKassa самого мастера, платёжным агентом сервис не является
-- (PRODUCT.md, раздел «Деньги»), и чеки по ним выбивает мастер.
--
-- Очередь, а не прямой вызов из вебхука: налоговая регулярно отвечает 5xx и
-- рвёт соединение, а вебхук ЮKassa обязан ответить быстро и один раз. Строка
-- в nalog_receipts живёт до тех пор, пока чек не выбит, и её же читает
-- фоновая job /api/jobs/nalog-receipts.
--
-- Главный инвариант — ровно один чек на платёж. Его держит unique по
-- provider_payment_id: и вебхук, и подборщик зависших платежей могут поставить
-- один и тот же платёж в очередь дважды, но строка будет одна.

begin;

-- Состояние подключения к «Моему налогу». Одна строка на платформу
-- (id = 'platform'), заведена под будущие аккаунты мастеров.
--
-- refreshToken налоговая ротирует при каждом обновлении токена, поэтому его
-- нельзя держать только в .env: после первого же обновления значение в файле
-- протухнет. Лежит зашифрованным (AES-256-GCM, NALOG_ENCRYPTION_SECRET) —
-- дамп базы не должен давать доступ к личному кабинету ФНС.
create table if not exists nalog_sync_state (
  id text primary key,
  -- Налоговая привязывает сессию к устройству: сменился deviceId — нужна
  -- новая авторизация. Поэтому он вычисляется один раз и хранится здесь.
  device_id text not null,
  refresh_token_encrypted text,
  last_authenticated_at timestamptz,
  -- Докуда просмотрены возвраты ЮKassa (аннулирование чеков). Отдельный
  -- курсор: возврат приходит много позже платежа.
  last_refund_sync_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Обслуживается только сервис-ролью (фоновая job и вебхук), как
-- telegram_link_tokens: RLS включена, политик нет — значит, снаружи не видно.
alter table nalog_sync_state enable row level security;

create table if not exists nalog_receipts (
  id uuid primary key default gen_random_uuid(),
  -- Откуда пришли деньги. Только собственный доход платформы: подписка PRO и
  -- доплата за места. Деньги клиентов (предоплата, чаевые, сертификаты) идут
  -- в магазин мастера и чеками платформы не закрываются.
  source text not null check (source in ('subscription', 'seat')),
  -- id строки-источника в subscription_payments.
  source_id uuid,
  provider_payment_id text not null unique,
  -- Мастер-плательщик. Нужен, чтобы разобрать спорный чек, не поднимая ЮKassa.
  profile_id uuid references profiles(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  -- Наименование услуги в чеке. Снимок на момент оплаты: тариф могли
  -- переименовать, а в чеке должно остаться то, что человек покупал.
  description text not null,
  -- Дата расчёта для чека — момент оплаты, а не момент выбивания чека.
  operation_time timestamptz not null,
  status text not null default 'pending' check (
    status in ('pending', 'registered', 'cancelled', 'failed')
  ),
  receipt_uuid text,
  receipt_url text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  registered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  -- Возврат ЮKassa, из-за которого чек аннулирован.
  refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Выборка очереди: только неоплаченные чеки, отсортированные по времени
-- следующей попытки. Частичный индекс — потому что зарегистрированных строк
-- со временем станет на порядки больше, чем ждущих.
create index if not exists nalog_receipts_queue_idx
on nalog_receipts(next_attempt_at)
where status = 'pending';

-- Поиск чека по возврату ЮKassa и разбор в админке.
create index if not exists nalog_receipts_status_idx
on nalog_receipts(status, created_at desc);

-- Один чек кабинета не может принадлежать двум платежам. Ограничение ловит
-- ошибку поиска уже выбитого чека (findIncome сверяет наименование и сумму —
-- если две строки случайно окажутся неотличимы, вторая упадёт здесь, а не
-- закроется чужим чеком молча).
create unique index if not exists nalog_receipts_receipt_uuid_idx
on nalog_receipts(receipt_uuid)
where receipt_uuid is not null;

alter table nalog_receipts enable row level security;

commit;

-- Откат:
-- begin;
-- drop index if exists nalog_receipts_receipt_uuid_idx;
-- drop index if exists nalog_receipts_status_idx;
-- drop index if exists nalog_receipts_queue_idx;
-- drop table if exists nalog_receipts;
-- drop table if exists nalog_sync_state;
-- commit;
