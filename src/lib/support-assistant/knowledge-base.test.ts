import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { supportKnowledgeSource } from "@/lib/support-assistant/knowledge-base";
import { SUPPORT_SITEMAP } from "@/lib/support-assistant/sitemap";

// Поиск по карте сервиса. Промахи здесь не падают, а тихо портят ответ: тема
// не подмешалась — бот отвечает по индексу, без шагов и нюансов, либо зовёт
// человека на вопрос, который знает сам.

async function titlesFor(query: string) {
  const { topics } = await supportKnowledgeSource.retrieve(query);
  return topics.map((topic) => topic.title);
}

describe("поиск по карте сервиса", () => {
  it("находит предоплату вместе с ЮKassa, без которой её не включить", async () => {
    const titles = await titlesFor("привет! как мне настроить предоплат?");

    expect(titles[0]).toBe("Предоплата за услугу");
    expect(titles).toContain("Подключение ЮKassa");
  });

  it("понимает синонимы, которых нет в названии темы", async () => {
    expect(await titlesFor("аванс")).toContain("Предоплата за услугу");
    expect(await titlesFor("не приходят уведомления")).toContain(
      "Telegram-уведомления мастеру",
    );
  });

  it("склоняемые слова находят тему по корню", async () => {
    const titles = await titlesFor("как удалить аккаунт");

    expect(titles[0]).toBe("Удаление аккаунта");
  });

  it("не тащит слабые совпадения по частотным словам", async () => {
    // «клиент» и «запись» встречаются почти в каждой теме: без отсечки
    // сюда попадала половина карты, включая чаевые и буфер между записями.
    const titles = await titlesFor("как отменить запись клиенту");

    expect(titles[0]).toBe("Отмена записи клиентом");
    expect(titles).not.toContain("Чаевые мастеру");
  });

  it("на нераспознанный вопрос отдаёт базовые темы, а не пустоту", async () => {
    const titles = await titlesFor("приветик");

    expect(titles.length).toBeGreaterThan(0);
    expect(titles).toContain("Структура кабинета");
  });

  it("индекс отдаётся целиком всегда", async () => {
    const { index } = await supportKnowledgeSource.retrieve("что угодно");

    expect(index).toHaveLength(SUPPORT_SITEMAP.length);
  });
});

describe("карта сервиса", () => {
  it("названия тем уникальны — по ним модель ссылается на источники", () => {
    const titles = SUPPORT_SITEMAP.map((topic) => topic.title.toLowerCase());

    expect(new Set(titles).size).toBe(titles.length);
  });

  it("все связанные темы существуют", () => {
    const ids = new Set(SUPPORT_SITEMAP.map((topic) => topic.id));
    const broken = SUPPORT_SITEMAP.flatMap((topic) =>
      (topic.related ?? []).filter((id) => !ids.has(id)).map((id) => `${topic.id} → ${id}`),
    );

    expect(broken).toEqual([]);
  });

  it("в исходнике карты нет захардкоженных цен и сроков", () => {
    // Тарифы уже один раз разъехались с кодом: бот рассказывал про «okno Pro
    // за 690 ₽» через месяц после того, как такого тарифа не стало. Проверять
    // надо именно ИСХОДНИК: в собранной строке цена из facts.ts выглядит так
    // же, как вписанная руками, и отличить их в готовых данных нельзя.
    const source = readFileSync(
      fileURLToPath(new URL("./sitemap.ts", import.meta.url)),
      "utf8",
    );

    const literalPrices = source.match(/\d[\d\s]*₽/g) ?? [];
    const literalDays = source.match(/\b\d+\s+(?:дней|дня|суток)\b/g) ?? [];

    expect({ literalPrices, literalDays }).toEqual({
      literalPrices: [],
      literalDays: [],
    });
  });
});
