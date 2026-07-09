export const env = {
  appMode: process.env.APP_MODE,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  phoneEncryptionSecret: process.env.PHONE_ENCRYPTION_SECRET,
  smsApiUrl: process.env.SMS_API_URL,
  smsApiKey: process.env.SMS_API_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  jobsSecret: process.env.JOBS_SECRET,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceRoleKey,
);

export const isSmsConfigured = Boolean(env.smsApiUrl && env.smsApiKey);

export const isTelegramConfigured = Boolean(env.telegramBotToken);
export const isJobsSecretConfigured = Boolean(env.jobsSecret);
export const isSupportAssistantConfigured = Boolean(env.anthropicApiKey);

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
