export const env = {
  appMode: process.env.APP_MODE,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  adminEmails: process.env.ADMIN_EMAILS,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  phoneEncryptionSecret: process.env.PHONE_ENCRYPTION_SECRET,
  smsApiUrl: process.env.SMS_API_URL,
  smsApiKey: process.env.SMS_API_KEY,
  smsRuApiId: process.env.SMSRU_API_ID,
  smsRuFrom: process.env.SMSRU_FROM,
  smsRuTestMode: process.env.SMSRU_TEST_MODE,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  // Секрет вебхука: Telegram присылает его в заголовке
  // X-Telegram-Bot-Api-Secret-Token, и это единственное доказательство, что
  // апдейт пришёл от Telegram, а не от того, кто угадал адрес эндпоинта.
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  // Необязательное: имя бота для ссылки t.me/<bot>?start=… Если не задано,
  // подтягивается из getMe и кешируется в памяти процесса.
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME,
  // Чат группы поддержки: туда бот приносит вопросы, на которые не нашёл
  // ответа в карте сервиса, и оттуда забирает ответы оператора. Именно
  // группа, а не личка: она не смешивается с мастерским ботом оператора, а
  // privacy mode в группах отдаёт боту только ответы на его собственные
  // сообщения — то есть ровно то, что нам нужно, и ничего лишнего.
  supportTelegramChatId: process.env.SUPPORT_TELEGRAM_CHAT_ID,
  // Чат, куда приходит обратная связь мастеров: идеи, причины отмены, ответы
  // на опросы. Необязательный — без него всё уходит в группу поддержки.
  feedbackTelegramChatId: process.env.FEEDBACK_TELEGRAM_CHAT_ID,
  jobsSecret: process.env.JOBS_SECRET,
  // Проверка автопродления вживую: укороченный расчётный период для
  // перечисленных профилей (см. src/lib/subscription-period.ts). Обе
  // переменные убираются после проверки.
  subscriptionTestPeriodMinutes: process.env.SUBSCRIPTION_TEST_PERIOD_MINUTES,
  subscriptionTestPeriodProfileIds: process.env.SUBSCRIPTION_TEST_PERIOD_PROFILE_IDS,
  yookassaShopId: process.env.YOOKASSA_SHOP_ID,
  yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY,
  yookassaOAuthClientId: process.env.YOOKASSA_OAUTH_CLIENT_ID,
  yookassaOAuthClientSecret: process.env.YOOKASSA_OAUTH_CLIENT_SECRET,
  yookassaOAuthTokenEncryptionSecret: process.env.YOOKASSA_OAUTH_TOKEN_ENCRYPTION_SECRET,
  // Транзакционная почта — Unisender Go, Web API (не SMTP).
  unisenderApiKey: process.env.UNISENDER_GO_API_KEY,
  unisenderApiUrl: process.env.UNISENDER_GO_API_URL,
  emailFrom: process.env.EMAIL_FROM,
  emailFromName: process.env.EMAIL_FROM_NAME,
  emailReplyTo: process.env.EMAIL_REPLY_TO,
  // Вебхуки Unisender Go подписывает сам (MD5 тела с подставленным API-ключом,
  // см. src/lib/email/webhook.ts), отдельный секрет им не нужен. Эта строка
  // закрывает ручной роут /api/email/test — открытый роут отправки писем был
  // бы спам-релеем.
  unisenderWebhookSecret: process.env.UNISENDER_WEBHOOK_SECRET,
  // Прокси в РФ для запросов к ЮKassa и Unisender (см. src/lib/net/ru-egress.ts).
  ruEgressProxyUrl: process.env.RU_EGRESS_PROXY_URL?.trim() || undefined,
  // «Мой налог» (НПД): чеки по платежам магазина платформы. ИНН нужен всегда —
  // он входит в ссылку на печатную форму чека, даже когда вход идёт по
  // refreshToken. Способ входа: 'password' (ИНН + пароль от ЛК ФНС) или
  // 'refresh' (аккаунт заведён через Госуслуги, пароля не существует).
  nalogInn: process.env.NALOG_INN,
  nalogAuthMethod: process.env.NALOG_AUTH_METHOD,
  nalogPassword: process.env.NALOG_PASSWORD,
  nalogRefreshToken: process.env.NALOG_REFRESH_TOKEN,
  nalogDeviceId: process.env.NALOG_DEVICE_ID,
  nalogEncryptionSecret: process.env.NALOG_ENCRYPTION_SECRET,
  // Какие потоки денег выбивают чек. По умолчанию все; списком через запятую
  // можно оставить только подписку, если чаевые и сертификаты решено проводить
  // иначе (см. docs/nalog-setup.md).
  nalogSources: process.env.NALOG_SOURCES,
  // Личный кабинет ФНС отвечает только на российские IP. Если приложение
  // живёт на зарубежном хостинге, сюда кладётся socks5:// или http://
  // прокси — им пользуются исключительно запросы к lknpd.nalog.ru.
  nalogProxyUrl: process.env.NALOG_PROXY_URL,
  // Запись технических ошибок в error_events. По умолчанию только продакшен:
  // локальный dev-сервер смотрит в ту же базу Supabase, и его ошибки сборки и
  // HMR засоряли ленту реальных проблем в админке. Значения true/false
  // перекрывают умолчание (например, чтобы проверить сбор ошибок локально).
  errorEventsEnabled: process.env.ERROR_EVENTS_ENABLED,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sentryTracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
  sentryReplaysSessionSampleRate: process.env.SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  sentryReplaysOnErrorSampleRate: process.env.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceRoleKey,
);

export const isSmsConfigured = Boolean(
  env.smsRuApiId || (env.smsApiUrl && env.smsApiKey),
);

export const isTelegramConfigured = Boolean(env.telegramBotToken);
// Бот принимает входящие только с секретом вебхука: без него эндпоинт
// отвечает 503 и никакие команды не выполняются.
export const isTelegramBotConfigured = Boolean(
  env.telegramBotToken && env.telegramWebhookSecret,
);
export const isJobsSecretConfigured = Boolean(env.jobsSecret);
export const isYooKassaConfigured = Boolean(
  env.yookassaShopId && env.yookassaSecretKey,
);
export const isYooKassaOAuthConfigured = Boolean(
  env.yookassaOAuthClientId &&
    env.yookassaOAuthClientSecret &&
    env.yookassaOAuthTokenEncryptionSecret,
);
export type NalogAuthMethod = "password" | "refresh";

export const nalogAuthMethod: NalogAuthMethod =
  env.nalogAuthMethod === "refresh" ? "refresh" : "password";

// Чеки НПД выключены, пока не задан способ входа: платежи при этом проходят
// как обычно, просто ни одна строка не встаёт в очередь на чек.
//
// В режиме refresh обязателен NALOG_ENCRYPTION_SECRET: налоговая ротирует
// refreshToken при каждом обновлении, живое значение переезжает в базу, и без
// ключа шифрования его некуда положить — следующий запуск остался бы с
// протухшим токеном из .env.
export const isNalogConfigured = Boolean(
  env.nalogInn &&
    (nalogAuthMethod === "refresh"
      ? env.nalogEncryptionSecret
      : env.nalogPassword),
);

// Без ключа и адреса отправителя письма не уйдут — остальной кабинет при этом
// работает, как и с невыключенной SMS-отправкой.
export const isEmailConfigured = Boolean(env.unisenderApiKey && env.emailFrom);
export const isSentryConfigured = Boolean(env.sentryDsn);

// Сбор ошибок в консоль работает всегда; сюда смотрит только запись в базу.
export const isErrorEventsEnabled =
  env.errorEventsEnabled === "true"
    ? true
    : env.errorEventsEnabled === "false"
      ? false
      : process.env.NODE_ENV === "production";
export const isSupportAssistantConfigured = Boolean(env.anthropicApiKey);

// Передача вопроса живому оператору. Не настроено — бот работает как раньше,
// просто честно отвечает, что точного ответа нет, вместо обещания передать.
export const isSupportEscalationConfigured = Boolean(
  env.supportTelegramChatId && isTelegramBotConfigured,
);

// Платформенные админы задаются списком почт в ADMIN_EMAILS (через запятую).
// Список — единственный источник истины: доступ к /admin нельзя получить
// правкой профиля в БД.
export const adminEmails = (env.adminEmails ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

export const isAdminConfigured = adminEmails.length > 0;

export type AppMode = "demo" | "work";

export const appMode: AppMode =
  env.appMode === "demo" || env.appMode === "work"
    ? env.appMode
    : isSupabaseConfigured
      ? "work"
      : "demo";

export const isDemoMode = appMode === "demo";
export const isWorkMode = appMode === "work";

export function ensureWorkRuntime(context: string) {
  if (isWorkMode && !isSupabaseConfigured) {
    throw new Error(
      `Рабочий контур не настроен: ${context}. Добавь рабочие ключи Supabase или переключи APP_MODE в demo.`,
    );
  }
}
