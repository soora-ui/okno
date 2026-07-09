# Аудит безопасности проекта okno

**Дата:** 2026-07-04
**Аудитор:** MiMoCode (SecDevOps)
**Стек:** Next.js 16, Supabase (PostgreSQL + Auth), ЮKassa, Zod, Sentry

---

## Содержание

1. [Обзор проекта](#обзор-проекта)
2. [Критические уязвимости](#критические-уязвимости)
3. [Высокий приоритет](#высокий-приоритет)
4. [Средний приоритет](#средний-приоритет)
5. [Низкий приоритет](#низкий-приоритет)
6. [Что сделано хорошо](#что-сделано-хорошо)
7. [Рекомендации по исправлению](#рекомендации-по-исправлению)

---

## Обзор проекта

**okno** — минималистичный сервис онлайн-записи для мастеров маникюра и бровей. Основные компоненты:

- **Аутентификация:** Supabase Auth (email + пароль), серверные сессии через `@supabase/ssr`
- **Платежи:** ЮKassa (PRO-подписка, вебхук для активации)
- **Хранение данных:** PostgreSQL через Supabase (RLS + сервисная роль)
- **Публичные страницы:** Запись клиентов через форму, SMS-подтверждение номера
- **Командный доступ:** Роли (admin/staff/solo), рабочие пространства
- **Уведомления:** SMS (sms.ru), Telegram Bot API

---

## Критические уязвимости

### 1. Вебхук ЮKassa не проверяет подпись

**Файл:** `src/app/api/payments/yookassa/webhook/route.ts`
**Строка:** 13-112

**Проблема:** Эндпоинт вебхука не проверяет заголовок `X-Content-HMAC-SHA256` или `X-Content-Signature`, который ЮKassa отправляет для верификации уведомлений. Любой атакующий может отправить поддельный POST-запрос на `/api/payments/yookassa/webhook`.

**Что написано в комментарии:**
```
Тело уведомления не является доверенным источником: статус
оплаты мы перепроверяем прямым запросом к API ЮKassa нашими ключами
```

**Реальность:** Перепроверка через API действительно происходит (хорошо), но отсутствие подписи означает:
- Любой может отправить фиктивные уведомления — это тратит API-запросы ЮKassa
- Возможна DoS-атака через массовые поддельные вебхуки
- Ошибки перепроверки попадают в логи Sentry — шум в мониторинге

**Вектор атаки:**
```
POST /api/payments/yookassa/webhook
Content-Type: application/json

{"object": {"id": "fake_payment_id_12345"}}
```

**Рекомендация:** Добавить проверку HMAC-подписи:
```typescript
const crypto = require('crypto');
const hmac = crypto.createHmac('sha256', env.yookassaSecretKey);
hmac.update(await request.text());
const expectedSignature = hmac.digest('hex');
if (request.headers.get('X-Content-HMAC-SHA256') !== expectedSignature) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
}
```

---

### 2. `updateWorkspaceSettingsAction` не проверяет принадлежность вызывающего

**Файл:** `src/app/actions/team.ts`
**Строки:** 101-152

**Проблема:** Action обновляет ВСЕ профили с совпадающим `workspace_id`, но не проверяет, что вызывающий действительно принадлежит этому workspace.

```typescript
// Обновляет ВСЕ профили с этим workspace_id
const { error } = await admin
  .from("profiles")
  .update({
    workspace_name: parsed.data.workspaceName,
    workspace_kind: parsed.data.workspaceKind,
  })
  .eq("workspace_id", profile.workspaceId);
```

**Реальность:** `requireAdminProfile()` проверяет роль `admin` и тип workspace, но НЕ проверяет, что `profile.workspaceId` совпадает с целевым workspace. Если staff-учетная запись каким-то образом получит доступ к этой форме, она сможет изменить настройки для всей организации.

**Рекомендация:** Добавить явную проверку workspace:
```typescript
if (profile.workspaceId !== targetWorkspaceId) {
  return { success: false, message: "Доступ запрещён." };
}
```

---

### 3. `redirectTo` в логине допускает open redirect

**Файл:** `src/app/actions/auth.ts`
**Строки:** 271-278

**Проблема:** Проверка `startsWith("/")` не блокирует протокольно-относительные URL:

```typescript
const redirectTo =
  parsed.data.redirectTo && parsed.data.redirectTo.startsWith("/")
    ? parsed.data.redirectTo
    : getDefaultAccountRoute({...});
```

**Вектор атаки:** Атакующий создаёт ссылку:
```
https://okno.app/login?redirectTo=//evil.com/steal-token
```
После успешного входа жертва перенаправляется на `//evil.com` (браузер интерпретирует как `https://evil.com`).

**Рекомендация:**
```typescript
const redirectTo = parsed.data.redirectTo;
const isSafeRedirect =
  redirectTo &&
  redirectTo.startsWith("/") &&
  !redirectTo.startsWith("//") &&
  !redirectTo.startsWith("/\\");
```

---

## Высокий приоритет

### 4. Демо-режим отключает все ограничения скорости на публичном API записей

**Файл:** `src/app/api/bookings/route.ts`
**Строки:** 62-82

**Проблема:** Когда Supabase не настроен (демо-режим), вся логика rate limiting, идемпотентности и SMS-подтверждения пропускается:

```typescript
if (!isSupabaseConfigured) {
  // Direct mock booking — без rate limiting, без верификации
  return NextResponse.json({...});
}
```

**Риск:** Если демо-режим работает на публичном сервере (Vercel, Render), эндпоинт записей полностью незащищён. Атакующий может:
- Заспамить mock-записи
- Использовать как прокси для генерации токенов отмены

**Рекомендация:** Добавить базовый rate limiting даже для демо-режима или явно блокировать демо на продакшене.

---

### 5. Секрет jobs-эндпоинта сравнивается без timing-safe сравнения

**Файл:** `src/app/api/jobs/notifications/route.ts`
**Строка:** 12

**Проблема:**
```typescript
return bearerToken === env.jobsSecret || headerToken === env.jobsSecret;
```

Оператор `===` в JavaScript выполняет посимвольное сравнение и прекращает работу при первом несовпадении. Это создаёт timing side-channel: атакующий может определить правильный секрет по времени отклика.

**Практическая оценка:** Низкая реальная угроза (секрет должен быть длинным и случайным), но нарушает best practices.

**Рекомендация:**
```typescript
import { timingSafeEqual } from 'node:crypto';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

return safeCompare(bearerToken, env.jobsSecret) || safeCompare(headerToken, env.jobsSecret);
```

---

### 6. SMS-код верификации не привязан к конкретной записи

**Файл:** `src/lib/phone-verification.ts`

**Проблема:** Токен верификации (`issuePhoneVerificationToken`) доказывает, что номер был подтверждён, но не привязан к конкретной услуге, времени или мастеру. Получив валидный токен, атакующий может:
- Создать запись на любую услугу мастера
- Создать запись на любое свободное время
- Использовать токен повторно (TTL 30 минут)

**Вектор атаки:**
1. Атакующий получает SMS-код для записи к мастеру А на услугу X
2. Использует тот же токен для записи к мастеру А на услугу Y
3. Или для записи к мастеру Б (если знает его username)

**Рекомендация:** Добавить в токен привязку к `username` и `serviceId`, либо.invalidate после использования.

---

### 7. `createSupabaseAdminClient()` не является синглтоном

**Файл:** `src/lib/supabase/admin.ts`

**Проблема:** Каждый вызов создаёт новый экземпляр клиента Supabase с сервисной ролью:

```typescript
export function createSupabaseAdminClient() {
  return createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {...});
}
```

**Риски:**
- Исчерпание соединений с PostgreSQL при высокой нагрузке
- Сервисная роль обходит ВСЕ RLS-политики — уязвимость в любом серверном коде означает полный доступ к БД
- Нет изоляции между запросами

**Рекомендация:** Рассмотреть синглтон или пул соединений.

---

## Средний приоритет

### 8. Нет CAPTCHA на публичных эндпоинтах

**Файлы:**
- `src/app/api/bookings/route.ts`
- `src/app/api/phone-verification/route.ts`

**Проблема:** Защита основана только на IP-ограничениях:
- 12 записей за 15 минут на IP для записей
- 10 SMS-кодов за час на IP
- 4 SMS на номер за час

**Риск:** IP-based rate limiting обходится через:
- Ротацию IP через прокси/VPN
- TOR-сеть
- Бот-сети

**Финансовый риск:** Атакующий может потратить деньги мастера на SMS (если SMS не в тестовом режиме).

**Рекомендация:** Добавить Turnstile/reCAPTCHA v3 на форму записи и верификацию телефона.

---

### 9. `decryptPhone` возвращает plaintext для нешифрованных записей

**Файл:** `src/lib/booking.ts`
**Строки:** 54-71

**Проблема:** Если в базе есть старые записи с нешифрованными телефонами, функция вернёт их как есть:

```typescript
if (!phoneEncrypted.startsWith(`${PHONE_ENCRYPTION_VERSION}:`)) {
  try {
    const decoded = Buffer.from(phoneEncrypted, "base64").toString("utf8");
    // ... fallback
    return phoneEncrypted; // Возвращает как есть
  } catch {
    return phoneEncrypted;
  }
}
```

**Рекомендация:** Добавить миграцию для шифрования старых записей. Логировать случаи, когда `decryptPhone` возвращает нешифрованное значение.

---

### 10. Метаданные аудит-логов фильтруются только по ключам

**Файл:** `src/lib/observability/audit.ts`
**Строки:** 23-35

**Проблема:**
```typescript
function sanitizeAuditMetadata(metadata: AuditMetadata) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !/phone|password|token|secret/i.test(key))
      .map(([key, value]) => [key, value ?? null]),
  );
}
```

Фильтр проверяет только **имена ключей**, но не **значения**. Если в `metadata` передан телефон как значение (а не как ключ), он попадёт в `audit_logs` в открытом виде.

**Рекомендация:** Расширить фильтрацию на значения или ограничить передачу чувствительных данных в metadata.

---

### 11. `bookingIdSchema` не валидирует формат UUID

**Файл:** `src/app/actions/bookings.ts`
**Строки:** 52-54

```typescript
const bookingIdSchema = z.object({
  bookingId: z.string().min(1),
});
```

Поле `bookingId` принимает любую непустую строку. Хотя это безопасно от SQL-инъекций (Supabase использует параметризованные запросы), это позволяет передать произвольные данные в `.eq("id", ...)`.

**Рекомендация:**
```typescript
bookingId: z.string().uuid(),
```

---

## Низкий приоритет


### 12. Сервисная роль используется в публичной странице отмены

**Файл:** `src/lib/data.ts:1075`

**Проблема:** Функция `getBookingCancellationData` использует `createSupabaseAdminClient()` для загрузки данных записи. Это обходит RLS и означает, что при компрометации серверного кода все данные записей доступны.

**Контекст:** Это осознанное решение — публичная страница отмены не имеет серверной сессии, поэтому RLS через пользователя невозможен.

---

### 13. Потенциальная проблема с перенаправлением в `buildLoginRedirect`

**Файл:** `src/proxy.ts:15-32`

**Проблема:** Параметр `next` из URL передаётся без валидации (хотя берётся из `nextUrl.pathname`, а не из query params). Паттерн может быть расширен небезопасно в будущем.



---

## Рекомендации по исправлению (приоритет)

| # | Приоритет | Уязвимость | Усилие |
|---|-----------|-----------|--------|
| 1 | КРИТИЧЕСКИЙ | Подпись вебхука ЮKassa | Низкое |
| 2 | КРИТИЧЕСКИЙ | Open redirect в login | Низкое |
| 3 | КРИТИЧЕСКИЙ | Проверка workspace в team action | Низкое |
| 4 | ВЫСОКИЙ | Timing-safe для jobs secret | Низкое |
| 5 | ВЫСОКИЙ | CAPTCHA на публичных формах | Среднее |
| 6 | ВЫСОКИЙ | Привязка SMS-токена к контексту | Среднее |
| 7 | ВЫСОКИЙ | Rate limiting в демо-режиме | Низкое |
| 8 | СРЕДНИЙ | Валидация UUID для bookingId | Низкое |
| 9 | СРЕДНИЙ | Фильтрация значений в audit metadata | Низкое |
| 10 | СРЕДНИЙ | Миграция нешифрованных телефонов | Среднее |
