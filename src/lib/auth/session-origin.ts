import { createSupabaseServerClient } from "@/lib/supabase/server";

// Каким способом получена текущая сессия кабинета.
//
// В кабинет можно попасть двумя путями: обычным входом по паролю и из
// мини-аппа Telegram, где пароль не спрашивают (личность подтверждает подпись
// Telegram и привязка чата, см. api/telegram/miniapp/master-session). Второй
// путь слабее: кто получил доступ к Telegram мастера, получил и кабинет.
// Поэтому действия с деньгами под такой сессией закрыты, пока мастер не
// введёт пароль.
//
// Признак берём из самой сессии, а не из отдельной cookie: Supabase пишет в
// токен способы входа (claim `amr`), токен подписан сервером авторизации, и
// подделать или «снять» эту отметку из браузера нельзя. Вход из мини-аппа
// даёт метод magiclink/otp, вход по паролю — password. После подтверждения
// паролем сессия заменяется на парольную, и ограничение снимается само.

type AmrEntry = { method?: string } | string;

const passwordlessMethods = new Set(["magiclink", "otp"]);

export async function isTelegramOriginSession(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      return false;
    }

    const amr = (data.claims as { amr?: AmrEntry[] }).amr ?? [];
    const methods = amr.map((entry) =>
      typeof entry === "string" ? entry : String(entry.method ?? ""),
    );

    return (
      methods.some((method) => passwordlessMethods.has(method)) &&
      !methods.includes("password")
    );
  } catch {
    // Сессию прочитать не удалось — действие всё равно остановит проверка
    // профиля. Здесь не блокируем, чтобы сбой не запирал обычный вход.
    return false;
  }
}

export const passwordRequiredMessage =
  "Кабинет открыт из Telegram без пароля. Чтобы продолжить, подтверди пароль — форма вверху страницы настроек.";
