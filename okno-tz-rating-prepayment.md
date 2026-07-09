# ТЗ: Рейтинг клиентов + настраиваемая предоплата (okno)

Стек: Supabase (Postgres + Auth + Edge Functions). Предоплата: ЮKassa.

---

## Модуль 1. Рейтинг клиентов (надёжность)

### Цель
Мастер видит надёжность клиента до подтверждения записи: процент визитов,
которые состоялись, без неявок и без поздних отмен. Фиксация — вручную,
мастер отмечает статус каждого визита постфактум.

### 1.1 Миграция БД

```sql
-- 001_client_reliability.sql

-- Статус визита. Если поле visit_status в appointments уже существует
-- под другим названием/типом — адаптировать, а не дублировать.
alter table appointments
  add column if not exists visit_status text
  check (visit_status in ('pending', 'completed', 'no_show', 'cancelled_late', 'cancelled_ok'))
  default 'pending';

alter table appointments
  add column if not exists visit_status_set_at timestamptz;

-- Порог "поздней" отмены в часах до начала визита.
-- Храним как настройку мастера, а не константу в коде — разные мастера
-- хотят разный порог (кто-то 24ч, кто-то 2ч).
alter table masters
  add column if not exists late_cancel_threshold_hours integer default 24;

-- View с агрегатами. Пересчитывается на чтении, не требует синхронизации.
create or replace view client_reliability as
select
  a.client_id,
  a.master_id,
  count(*) as total_finished,
  count(*) filter (where a.visit_status = 'completed') as completed,
  count(*) filter (where a.visit_status = 'no_show') as no_shows,
  count(*) filter (where a.visit_status = 'cancelled_late') as late_cancels,
  count(*) filter (where a.visit_status = 'cancelled_ok') as ok_cancels,
  round(
    100.0 * count(*) filter (where a.visit_status = 'completed')
    / greatest(count(*) filter (where a.visit_status in
        ('completed','no_show','cancelled_late')), 1)
  )::int as reliability_score
from appointments a
where a.visit_status != 'pending'
group by a.client_id, a.master_id;
```

**Решения, зафиксированные в схеме (не менять без явного обсуждения):**

- `cancelled_late` и `cancelled_ok` — разные статусы. Клиент, предупредивший
  заранее, не должен штрафоваться так же, как клиент, не пришедший вовсе.
- Порог "позднее/раннее" — настройка мастера (`late_cancel_threshold_hours`),
  не хардкод.
- `reliability_score` считается только по визитам, где визит уже наступил
  и статус выставлен (`visit_status != 'pending'`). Будущие записи не
  участвуют в расчёте.
- View скоупится per `master_id` — рейтинг приватный, в рамках одного
  мастера. См. "Открытый вопрос" ниже про глобальный вариант.

### 1.2 Логика "минимальной выборки"

В коде (не в SQL), при отображении рейтинга в UI:

```
if total_finished < 3:
    показывать "Недостаточно данных" вместо процента/бейджа
else:
    показывать reliability_score как бейдж:
      >= 80%  → зелёный  "Надёжный"
      50–79%  → жёлтый   "Бывают пропуски"
      < 50%   → красный  "Высокий риск неявки"
```

Не показывать жёсткий бейдж на основании 1–2 визитов — один форс-мажор не
должен вешать ярлык на нового клиента.

### 1.3 UI / флоу

**A. Отметка статуса визита (мастер).**
- На карточке прошедшей записи со статусом `pending` — кнопки:
  "Пришёл" / "Не пришёл" / "Отменил заранее" / "Отменил поздно".
- "Поздно" vs "заранее" система может подставить автоматически по факту
  времени отмены относительно `late_cancel_threshold_hours`, но финальное
  решение — за мастером (разрешить переключить вручную).
- На дашборде — баннер/счётчик "У вас N визитов без отметки" за прошедшие
  дни, чтобы рейтинг не оставался пустым из-за забывчивости.

**B. Отображение при записи (мастер создаёт/подтверждает слот клиенту).**
- На карточке клиента в форме записи — бейдж рядом с именем
  (см. правило 1.2).
- При клике/раскрытии — детали: "8 из 10 визитов состоялись, 1 неявка,
  1 поздняя отмена".

### 1.4 Открытый вопрос (требует решения до реализации)

Рейтинг приватный (per master_id) или глобальный (виден всем мастерам в
системе)? Глобальный полезнее для отрасли (неблагонадёжный клиент виден
сразу всем), но это по сути расшаренный чёрный список — юридически и
репутационно чувствительнее. **Рекомендация для MVP: оставить приватным**,
глобальный вариант — отдельная фича после теста гипотезы на приватном.

---

## Модуль 2. Настраиваемая предоплата по услугам

### Цель
Мастер включает предоплату на конкретные услуги (не на все сразу), задаёт
тип (фиксированная сумма / процент) и значение. Клиент платит при
создании записи на такую услугу через ЮKassa.

### 2.1 Миграция БД

```sql
-- 002_service_prepayment.sql

alter table services
  add column if not exists prepayment_type text
  check (prepayment_type in ('none', 'fixed', 'percent'))
  default 'none';

alter table services
  add column if not exists prepayment_value numeric default 0;
  -- fixed: сумма в рублях. percent: 0-100, считается от services.price

alter table appointments
  add column if not exists prepayment_required boolean default false;
  -- снэпшот на момент создания записи: было ли требование предоплаты
  -- активно. Не пересчитывать задним числом, если мастер позже меняет
  -- настройки услуги — это сломает историю старых записей.

create table if not exists prepayments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  amount numeric not null,
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded', 'expired'))
    default 'pending',
  provider text not null default 'yookassa',
  provider_payment_id text unique,
  confirmation_url text,
  created_at timestamptz default now(),
  paid_at timestamptz,
  expires_at timestamptz default (now() + interval '15 minutes')
);

create index if not exists idx_prepayments_appointment on prepayments(appointment_id);
create index if not exists idx_prepayments_provider_id on prepayments(provider_payment_id);
```

**Зафиксированные решения:**

- `prepayment_required` — снэпшот, не вычисляемое поле. Если мастер отключит
  предоплату на услуге после того, как клиент уже записался и оплатил,
  старая запись не должна "потерять" факт предоплаты.
- Слот резервируется на 15 минут (`expires_at`) под оплату. Если оплата не
  пришла за это время — слот освобождается, запись переходит в статус
  отмены (см. 2.4, фоновая job).
- `provider_payment_id` — уникальный, для идемпотентности вебхука.

### 2.2 Настройка предоплаты (мастер, UI)

На странице услуги — переключатель:
```
Предоплата: [Выключена | Фиксированная сумма | Процент от стоимости]
Если включена — поле значения (₽ или %).
```
Простое правило валидации: percent ∈ [1, 100], fixed > 0 и <= price услуги
(не давать поставить предоплату больше полной стоимости).

### 2.3 Поток оплаты (клиент создаёт запись на услугу с предоплатой)

```
1. Клиент выбирает услугу + слот → POST /api/appointments
2. Backend проверяет services.prepayment_type для выбранной услуги
3. Если prepayment_type != 'none':
     a. Считает amount (fixed → как есть, percent → price * value / 100)
     b. Создаёт appointment со status='pending_payment',
        prepayment_required=true
     c. Создаёт запись в prepayments (status='pending')
     d. Создаёт платёж в ЮKassa (Edge Function, см. 2.4)
     e. Возвращает клиенту confirmation_url для редиректа на оплату
4. Если prepayment_type == 'none': обычный флоу записи без оплаты
```

Слот в расписании помечается как "занят, ожидает оплаты" — другие клиенты
не должны видеть его свободным в эти 15 минут, иначе двойная запись.

### 2.4 Edge Function: создание платежа (ЮKassa)

```
POST https://api.yookassa.ru/v3/payments
Headers:
  Idempotence-Key: <appointment_id> + <timestamp>  -- обязательно для retry
  Authorization: Basic <shop_id:secret_key>
Body:
  {
    "amount": { "value": "<amount>", "currency": "RUB" },
    "confirmation": { "type": "redirect", "return_url": "<okno_app_url>/booking/<id>/done" },
    "capture": true,
    "description": "Предоплата: <service_name>, <master_name>",
    "metadata": { "appointment_id": "<id>", "prepayment_id": "<id>" }
  }
```

Сохранить `provider_payment_id` (поле `id` из ответа ЮKassa) и
`confirmation_url` в таблицу `prepayments`.

### 2.5 Edge Function: вебхук подтверждения оплаты

```
POST /functions/v1/yookassa-webhook
```

Логика:
```
1. Принять payload вебхука (события: payment.succeeded, payment.canceled)
2. КРИТИЧНО: проверить, что provider_payment_id уже не обработан
   (select status from prepayments where provider_payment_id = ...)
   — если status уже 'paid', вернуть 200 и выйти (идемпотентность,
   ЮKassa может слать вебхук повторно)
3. Если payment.succeeded:
     - prepayments.status = 'paid', paid_at = now()
     - appointments.status = 'confirmed' (снять pending_payment)
4. Если payment.canceled:
     - prepayments.status = 'failed'
     - appointments.status = 'cancelled' (освободить слот)
5. Желательно: верифицировать подпись/источник запроса
   (ЮKassa рекомендует whitelist IP или Basic Auth на эндпоинт вебхука —
   уточнить в актуальной документации ЮKassa перед реализацией)
```

### 2.6 Фоновая job: протухшие резервации

Раз в несколько минут (Supabase pg_cron или Edge Function по таймеру):
```sql
update prepayments
set status = 'expired'
where status = 'pending' and expires_at < now();

update appointments
set status = 'cancelled', prepayment_required = false
where id in (
  select appointment_id from prepayments
  where status = 'expired' and appointment_id is not null
)
and status = 'pending_payment';
```
Это освобождает слот, если клиент открыл оплату и не завершил её.

### 2.7 Открытые вопросы (требуют решения до реализации)

- **Возврат предоплаты.** Что происходит с `prepayments.status='paid'`,
  если клиент отменяет визит заранее (`cancelled_ok`)? Нужно ли
  автоматически инициировать возврат через ЮKassa API
  (`POST /v3/refunds`), или это решает мастер вручную через личный
  кабинет ЮKassa? Для MVP можно оставить вручную — добавить только
  пометку в UI "клиент оплатил предоплату, отмена — обработать возврат
  самостоятельно".
- **No-show с уже оплаченной предоплатой.** Предоплата сгорает в пользу
  мастера (это и есть смысл фичи) — явно зафиксировать в UI для клиента
  на этапе оплаты ("предоплата невозвратна при неявке"), чтобы не было
  претензий.

---

## Порядок реализации (рекомендуемый)

1. Миграция 001 (рейтинг) — она проще и не требует внешних интеграций.
2. UI отметки статуса визита + бейдж надёжности на карточке клиента.
3. Миграция 002 (предоплата) — схема и настройка на услуге.
4. Edge Function создания платежа + редирект клиента.
5. Edge Function вебхука + идемпотентность.
6. Фоновая job протухания резерваций.
7. Тест полного цикла на тестовом магазине ЮKassa (sandbox) перед продакшеном.
