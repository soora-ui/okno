import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logError: vi.fn() }));

const { listCatalogCities, searchCatalog } = await import("@/lib/telegram/miniapp-catalog");
type CatalogMaster = import("@/lib/telegram/miniapp-catalog").CatalogMaster;

function master(input: Partial<CatalogMaster> & { username: string }): CatalogMaster {
  return {
    profileId: input.username,
    name: input.username,
    specialty: "",
    city: "Москва",
    address: "",
    avatarUrl: null,
    url: `https://okno.business/${input.username}`,
    priceFrom: null,
    topServices: [],
    serviceTitles: [],
    rating: null,
    ...input,
  };
}

const masters = [
  master({ username: "anna", name: "Анна", specialty: "Маникюр", serviceTitles: ["Гель-лак"] }),
  master({
    username: "olga",
    name: "Ольга",
    specialty: "Брови",
    city: "Омск",
    serviceTitles: ["Ламинирование"],
    rating: { average: 4.8, count: 5 },
  }),
  master({
    username: "alena",
    name: "Алёна",
    specialty: "Маникюр",
    serviceTitles: ["Педикюр"],
    rating: { average: 5, count: 2 },
  }),
];

describe("searchCatalog", () => {
  it("без фильтров отдаёт всех, сначала с лучшей оценкой, без отзывов — в конце", () => {
    expect(searchCatalog(masters, {}).map((item) => item.username)).toEqual([
      "alena",
      "olga",
      "anna",
    ]);
  });

  it("фильтрует по городу без учёта регистра", () => {
    expect(searchCatalog(masters, { city: "омск" }).map((item) => item.username)).toEqual([
      "olga",
    ]);
  });

  it("ищет по имени, специализации и названиям услуг", () => {
    expect(searchCatalog(masters, { query: "гель" }).map((item) => item.username)).toEqual([
      "anna",
    ]);
    expect(searchCatalog(masters, { query: "маникюр" })).toHaveLength(2);
  });

  it("требует, чтобы нашлись все слова запроса", () => {
    expect(
      searchCatalog(masters, { query: "маникюр анна" }).map((item) => item.username),
    ).toEqual(["anna"]);
  });

  it("не различает «е» и «ё»", () => {
    expect(searchCatalog(masters, { query: "алена" }).map((item) => item.username)).toEqual([
      "alena",
    ]);
  });
});

describe("listCatalogCities", () => {
  it("считает мастеров по городам и ставит самые населённые первыми", () => {
    expect(listCatalogCities(masters)).toEqual([
      { name: "Москва", count: 2 },
      { name: "Омск", count: 1 },
    ]);
  });
});
