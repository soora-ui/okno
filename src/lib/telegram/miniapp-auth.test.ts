import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const botToken = "123456:TEST-BOT-TOKEN";

vi.mock("@/lib/env", () => ({
  env: { telegramBotToken: botToken },
}));

const { validateMiniAppInitData } = await import("@/lib/telegram/miniapp-auth");

// Собираем initData так же, как это делает Telegram: сортированная строка
// проверки, HMAC от токена с ключом "WebAppData", подпись этим секретом.
function buildInitData(input: {
  userId: number;
  authDate?: number;
  username?: string;
  breakSignature?: boolean;
}) {
  const params = new URLSearchParams({
    auth_date: String(input.authDate ?? Math.floor(Date.now() / 1000)),
    query_id: "AAEtest",
    user: JSON.stringify({
      id: input.userId,
      first_name: "Тест",
      ...(input.username ? { username: input.username } : {}),
    }),
  });

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  // Первый символ меняем на заведомо другой: замена на «0» не портила хеш,
  // который с «0» и начинался (раз в 16 прогонов).
  const broken = hash.replace(/^./, (first) => (first === "0" ? "1" : "0"));
  params.set("hash", input.breakSignature ? broken : hash);

  return params.toString();
}

describe("validateMiniAppInitData", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("принимает подпись, собранную по схеме Telegram", () => {
    const result = validateMiniAppInitData(buildInitData({ userId: 42, username: "tema" }));

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.user).toEqual({
      telegramUserId: "42",
      handle: "@tema",
      firstName: "Тест",
    });
  });

  it("отклоняет испорченную подпись", () => {
    const result = validateMiniAppInitData(
      buildInitData({ userId: 42, breakSignature: true }),
    );

    expect(result.status).toBe("invalid");
  });

  // Главное, ради чего всё это: подменить telegram_user_id в теле запроса
  // тривиально, и подпись — единственное, что этому мешает.
  it("отклоняет подмену пользователя при валидной в остальном строке", () => {
    const original = buildInitData({ userId: 42 });
    const tampered = new URLSearchParams(original);
    tampered.set("user", JSON.stringify({ id: 999, first_name: "Чужой" }));

    expect(validateMiniAppInitData(tampered.toString()).status).toBe("invalid");
  });

  it("отклоняет просроченную строку", () => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;

    expect(validateMiniAppInitData(buildInitData({ userId: 42, authDate: twoDaysAgo }))
      .status).toBe("expired");
  });

  it("отклоняет пустую строку и строку без подписи", () => {
    expect(validateMiniAppInitData("").status).toBe("invalid");
    expect(validateMiniAppInitData("auth_date=1&user=%7B%22id%22%3A1%7D").status).toBe(
      "invalid",
    );
  });
});
