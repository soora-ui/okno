# ТЗ: Эскалация вопросов AI-поддержки оператору в Telegram

## 1. Проблема

AI-поддержка отвечает по карте сервиса (`src/lib/support-assistant/sitemap.ts`). Карта покрывает функциональность, но не покрывает:

- частные случаи («у меня деньги не пришли за конкретную запись»),
- вопросы про будущее («когда будет интеграция с Instagram»),
- спорные ситуации, где нужен человек.

Сейчас в таких случаях бот отвечает по регламенту («такой функции нет» / уточняющие варианты). Регламент прямо запрещает отправлять пользователя «в поддержку» — он уже в ней. Значит, нужен канал к живому оператору, и он должен быть незаметен для пользователя: тот просто ждёт ответа в том же чате.

## 2. Решение

Когда модель не уверена в ответе, она помечает ответ флагом. Вместо отправки ответа пользователю сервис:

1. Складывает обращение в БД со статусом `pending`.
2. Шлёт оператору в Telegram: суть вопроса + черновик ответа, который бот собирался дать.
3. Показывает пользователю «Уточняю у специалиста, отвечу здесь через пару минут».
4. Оператор отвечает **reply-ом** на сообщение бота в Telegram.
5. Webhook принимает ответ, кладёт в ту же строку, статус → `answered`.
6. Виджет поллит эндпоинт и показывает ответ в чате.

## 3. Схема БД

Миграция `supabase/migrations/<дата>_support_escalations.sql`:

```sql
create table support_escalations (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  draft_answer text not null,
  -- Краткая суть вопроса от модели — то, что читает оператор в TG.
  summary text not null,
  status text not null default 'pending'
    check (status in ('pending', 'answered', 'expired')),
  operator_reply text,
  -- message_id сообщения бота в TG: по нему webhook находит строку,
  -- когда оператор отвечает reply-ом.
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index support_escalations_telegram_message_id_idx
  on support_escalations (telegram_message_id)
  where status = 'pending';
```

RLS: доступ только у service-role. Виджет ходит через API-роут, напрямую в таблицу не лезет — иначе анонимный пользователь сможет читать чужие обращения.

## 4. ENV

- `SUPPORT_TELEGRAM_CHAT_ID` — чат оператора (личка или группа).
- `TELEGRAM_WEBHOOK_SECRET` — сверяется с заголовком `X-Telegram-Bot-Api-Secret-Token`, иначе webhook сможет дёрнуть кто угодно.

`TELEGRAM_BOT_TOKEN` уже есть в `src/lib/env.ts`. Добавить флаг `isSupportEscalationConfigured` — при отсутствии переменных фича молча отключается, бот отвечает как сейчас.

## 5. Изменения в промпте и схеме ответа

В `supportAnswerTool` (`src/lib/support-assistant/prompt.ts`) добавить поля:

```ts
needsHuman: {
  type: "boolean",
  description:
    "true, если в карте сервиса нет данных для точного ответа: частный случай конкретного аккаунта, вопрос про планы развития, спорная ситуация.",
},
summary: {
  type: "string",
  description: "Суть вопроса одной строкой для оператора. Заполняется только при needsHuman.",
},
```

В промпт — правило: сомневаешься между «выдумать» и «отказать» → ставь `needsHuman: true`. Ложное срабатывание стоит одного сообщения оператору, ложный отказ — потерянного доверия.

## 6. Роут `/api/support-chat`

При `needsHuman === true`:

1. `insert into support_escalations` со `status = 'pending'`.
2. `sendMessage` в `SUPPORT_TELEGRAM_CHAT_ID`, текст:
   ```
   Вопрос от пользователя:
   <question>

   Суть: <summary>

   Черновик ответа бота:
   <draft_answer>

   Ответь reply-ом на это сообщение — текст уйдёт пользователю.
   ```
3. Сохранить `result.message_id` в `telegram_message_id`.
4. Вернуть `{ reply: "Уточняю у специалиста...", escalationId }`.

Если Telegram не ответил или фича не сконфигурена — отдать черновик как обычный ответ, эскалацию не создавать. Пользователь не должен остаться без ответа из-за упавшей интеграции.

## 7. Роут `/api/telegram/webhook`

`POST`, публичный. Порядок проверок:

1. Заголовок `X-Telegram-Bot-Api-Secret-Token` совпадает с `TELEGRAM_WEBHOOK_SECRET` — иначе `401` без тела.
2. В апдейте есть `message.reply_to_message.message_id`.
3. `message.chat.id` равен `SUPPORT_TELEGRAM_CHAT_ID` — иначе игнор: отвечать может только оператор.
4. Найти строку по `telegram_message_id` со статусом `pending`.
5. Записать `operator_reply = message.text`, `status = 'answered'`, `answered_at = now()`.
6. Ответить `200` с пустым телом (Telegram ретраит на не-2xx).

Регистрация webhook — разово, вручную:

```bash
curl -F "url=https://okno.business/api/telegram/webhook" -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

Учесть: бот уже используется для уведомлений мастерам. Webhook будет получать **все** апдейты, поэтому шаги 2–3 обязательны — всё, что не reply от оператора, тихо игнорируется.

## 8. Роут `/api/support-chat/escalation/[id]`

`GET`, возвращает `{ status, reply }`. Рейт-лимит по IP как в `/api/support-chat`. По `id` (uuid) угадать чужое обращение нереально, но отдавать нужно только `status` и `operator_reply` — ни `question`, ни `draft_answer` наружу не уходят.

## 9. Виджет

- Сообщение-заглушка со спиннером и текстом «Уточняю у специалиста».
- Поллинг раз в 5 секунд, максимум 5 минут.
- Пришёл ответ → заглушка заменяется текстом оператора.
- Таймаут → «Специалист ответит позже. Проверь чат через некоторое время». Строка в БД остаётся `pending`, ответ можно будет показать при следующем открытии чата (по `escalationId` в `localStorage`).

## 10. Что не входит

- Переписка с оператором в несколько реплик — только один вопрос и один ответ.
- Inline-кнопка «Отправить черновик как есть» — возможное упрощение второй итерации, если окажется, что оператор в большинстве случаев просто подтверждает черновик.
- Дообучение карты по эскалациям: накопленные `question` + `operator_reply` — готовый материал, чтобы дописывать темы в `sitemap.ts` руками.
