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
  jobsSecret: process.env.JOBS_SECRET,
  yookassaShopId: process.env.YOOKASSA_SHOP_ID,
  yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY,
  yookassaOAuthClientId: process.env.YOOKASSA_OAUTH_CLIENT_ID,
  yookassaOAuthClientSecret: process.env.YOOKASSA_OAUTH_CLIENT_SECRET,
  yookassaOAuthTokenEncryptionSecret: process.env.YOOKASSA_OAUTH_TOKEN_ENCRYPTION_SECRET,
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
export const isJobsSecretConfigured = Boolean(env.jobsSecret);
export const isYooKassaConfigured = Boolean(
  env.yookassaShopId && env.yookassaSecretKey,
);
export const isYooKassaOAuthConfigured = Boolean(
  env.yookassaOAuthClientId &&
    env.yookassaOAuthClientSecret &&
    env.yookassaOAuthTokenEncryptionSecret,
);
export const isSentryConfigured = Boolean(env.sentryDsn);
export const isSupportAssistantConfigured = Boolean(env.anthropicApiKey);

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
