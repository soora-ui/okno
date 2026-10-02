import { createHash } from "node:crypto";

/**
 * Демо-кабинет для тура (/demo/tour): настоящие страницы кабинета на
 * мок-данных, доступные без входа по адресам /demo/cabinet/*.
 *
 * Флаг «это демо-кабинет» ставит только proxy и только на GET-запросы к этим
 * адресам. Значение выводится из серверного секрета, поэтому клиент не может
 * подделать заголовок и получить мок-профиль на других маршрутах. В серверных
 * действиях флаг игнорируется: из демо-кабинета ничего не записывается.
 */
export const DEMO_CABINET_PREFIX = "/demo/cabinet";
export const DEMO_CABINET_HEADER = "x-okno-demo-cabinet";

let cachedToken: string | null = null;

export function demoCabinetToken() {
  cachedToken ??= createHash("sha256")
    .update(`okno-demo-cabinet:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "local"}`)
    .digest("hex");
  return cachedToken;
}

export function isDemoCabinetHeaders(headers: Headers) {
  return (
    headers.get(DEMO_CABINET_HEADER) === demoCabinetToken() &&
    !headers.has("next-action")
  );
}
