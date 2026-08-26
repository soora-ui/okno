// Проверка подключения к «Моему налогу» (lknpd.nalog.ru).
//
//   node --env-file=.env.local scripts/nalog-check.mjs
//   node --env-file=.env.local scripts/nalog-check.mjs --incomes
//
// Ничего не выбивает и не аннулирует: только входит в кабинет и показывает,
// что видит. Нужен, чтобы отделить «не настроено» от «не работает» до того,
// как первый настоящий платёж встанет в очередь.
//
// С --incomes дополнительно печатает чеки за последние 7 дней — так можно
// сверить, что job действительно доносит доход до кабинета.
//
// ВАЖНО: скрипт читает NALOG_REFRESH_TOKEN из окружения, а не из базы. Если
// приложение уже работало в режиме refresh, живой токен лежит в
// nalog_sync_state, а значение в .env протухло — тогда скрипт покажет отказ
// входа, хотя у приложения всё хорошо. Это ожидаемо.

import { createHash } from "node:crypto";

const API_BASE = "https://lknpd.nalog.ru/api/v1";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

const inn = process.env.NALOG_INN?.trim();
const password = process.env.NALOG_PASSWORD;
const refreshToken = process.env.NALOG_REFRESH_TOKEN?.trim();
const authMethod = process.env.NALOG_AUTH_METHOD === "refresh" ? "refresh" : "password";
const deviceId =
  process.env.NALOG_DEVICE_ID?.trim() ||
  createHash("sha256").update(inn ?? "", "utf8").digest("hex").slice(0, 21);
const withIncomes = process.argv.includes("--incomes");

if (!inn) {
  throw new Error("Нет NALOG_INN в окружении.");
}

if (authMethod === "password" && !password) {
  throw new Error("Режим password: нужен NALOG_PASSWORD.");
}

if (authMethod === "refresh" && !refreshToken) {
  throw new Error("Режим refresh: нужен NALOG_REFRESH_TOKEN.");
}

const headers = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ru,en-US;q=0.9,en;q=0.8",
  "Content-Type": "application/json",
  Origin: "https://lknpd.nalog.ru",
  Referer: "https://lknpd.nalog.ru/",
  "User-Agent": USER_AGENT,
};

const deviceInfo = {
  sourceDeviceId: deviceId,
  sourceType: "WEB",
  appVersion: "1.0.0",
  metaDetails: { userAgent: USER_AGENT },
};

console.log(`ИНН: ${inn}`);
console.log(`Вход: ${authMethod}`);
console.log(`deviceId: ${deviceId}`);

const authPath = authMethod === "refresh" ? "/auth/token" : "/auth/lkfl";
const authBody =
  authMethod === "refresh"
    ? { deviceInfo, refreshToken }
    : { username: inn, password, deviceInfo };

const authResponse = await fetch(`${API_BASE}${authPath}`, {
  method: "POST",
  headers,
  body: JSON.stringify(authBody),
  signal: AbortSignal.timeout(30_000),
});

if (!authResponse.ok) {
  const text = await authResponse.text();
  throw new Error(`Вход отклонён (${authResponse.status}): ${text.slice(0, 300)}`);
}

const auth = await authResponse.json();
console.log("\n✓ Вход выполнен.");
console.log(`  токен действует до: ${auth.tokenExpireIn ?? "—"}`);

if (auth.profile) {
  console.log(`  кабинет: ${auth.profile.displayName ?? "—"}`);
  console.log(`  статус НПД: ${auth.profile.status ?? "—"}`);
  if (auth.profile.inn && auth.profile.inn !== inn) {
    console.log(`  ⚠ ИНН кабинета (${auth.profile.inn}) не совпадает с NALOG_INN.`);
  }
}

if (auth.refreshToken && auth.refreshToken !== refreshToken) {
  console.log(
    "\n⚠ Кабинет выдал новый refreshToken. Приложение сохраняет такие токены в базу само;\n" +
      "  для первичной настройки положи его в NALOG_REFRESH_TOKEN:\n" +
      `  ${auth.refreshToken}`,
  );
}

if (!withIncomes) {
  console.log("\nЧеки не запрашивались. Запусти с --incomes, чтобы посмотреть последние.");
  process.exit(0);
}

const now = new Date();
const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const query = new URLSearchParams({
  from: from.toISOString(),
  to: now.toISOString(),
  offset: "0",
  sortBy: "operation_time:desc",
  limit: "50",
});

const incomesResponse = await fetch(`${API_BASE}/incomes?${query}`, {
  headers: { ...headers, Authorization: `Bearer ${auth.token}` },
  signal: AbortSignal.timeout(30_000),
});

if (!incomesResponse.ok) {
  const text = await incomesResponse.text();
  throw new Error(`Список чеков недоступен (${incomesResponse.status}): ${text.slice(0, 300)}`);
}

const incomes = await incomesResponse.json();
const items = incomes.content ?? [];

console.log(`\nЧеки за 7 дней: ${items.length}`);
for (const income of items) {
  const cancelled = income.cancellationInfo ? " (аннулирован)" : "";
  console.log(
    `  ${income.operationTime ?? "—"}  ${income.totalAmount} ₽  ${income.name ?? "—"}${cancelled}`,
  );
}
