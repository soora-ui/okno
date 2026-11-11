import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// Проверка подписи мини-аппа.
//
// Мини-апп открывается внутри Telegram и получает строку initData — параметры
// запуска, подписанные ключом, выведенным из токена бота. Это единственное
// доказательство того, кто именно открыл страницу: cookie здесь нет, сессии
// нет, а telegram_user_id из тела запроса подделывается тривиально.
//
// Схема из документации Telegram: секрет — это HMAC от токена бота с ключом
// "WebAppData", а подпись — HMAC строки проверки этим секретом. Порядок
// аргументов тут неочевиден и перепутать его легко, поэтому вынесено отдельно
// и покрыто тестом.

// Сколько живёт подпись. initData выдаётся один раз при запуске мини-аппа и
// сама не обновляется, поэтому короткий срок ломал бы долгие сессии: человек
// свернул Telegram на час и вернулся к «сессия истекла». Сутки — компромисс
// между этим и тем, что перехваченная строка не должна работать вечно.
const initDataMaxAgeSeconds = 24 * 60 * 60;

export type MiniAppUser = {
  telegramUserId: string;
  handle: string | null;
  firstName: string | null;
};

export type ValidateInitDataResult =
  | { status: "ok"; user: MiniAppUser }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "unconfigured" };

// maxAgeSeconds сужает срок для чувствительных вызовов: вход в кабинет
// мастера принимает только свежую подпись (см. master-session/route.ts).
export function validateMiniAppInitData(
  initData: string,
  options: { maxAgeSeconds?: number } = {},
): ValidateInitDataResult {
  const botToken = env.telegramBotToken;

  if (!botToken) {
    return { status: "unconfigured" };
  }

  if (!initData) {
    return { status: "invalid" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return { status: "invalid" };
  }

  // Строка проверки: все параметры кроме подписи, отсортированные по имени.
  // Значения берутся уже раскодированными — URLSearchParams делает это сам.
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (!isSameHex(computed, hash)) {
    return { status: "invalid" };
  }

  const authDate = Number(params.get("auth_date") ?? 0);

  if (!authDate || Number.isNaN(authDate)) {
    return { status: "invalid" };
  }

  const maxAgeSeconds = Math.min(
    options.maxAgeSeconds ?? initDataMaxAgeSeconds,
    initDataMaxAgeSeconds,
  );

  if (Date.now() / 1000 - authDate > maxAgeSeconds) {
    return { status: "expired" };
  }

  const user = parseUser(params.get("user"));

  if (!user) {
    return { status: "invalid" };
  }

  return { status: "ok", user };
}

function isSameHex(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function parseUser(raw: string | null): MiniAppUser | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      id?: number;
      username?: string;
      first_name?: string;
    };

    if (!parsed.id) {
      return null;
    }

    return {
      telegramUserId: String(parsed.id),
      handle: parsed.username ? `@${parsed.username}` : null,
      firstName: parsed.first_name ?? null,
    };
  } catch {
    return null;
  }
}
