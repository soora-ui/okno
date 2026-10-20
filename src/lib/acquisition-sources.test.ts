import { describe, expect, it } from "vitest";
import {
  acquisitionSourceFromReferrer,
  resolveAcquisitionSource,
  summarizeAcquisitionSources,
  withAcquisitionSource,
} from "@/lib/acquisition-sources";

describe("acquisitionSourceFromReferrer", () => {
  it.each([
    ["https://l.instagram.com/", "instagram"],
    ["https://web.telegram.org/", "telegram"],
    ["https://t.me/", "telegram"],
    ["https://away.vk.com/", "vk"],
    ["https://www.avito.ru/", "avito"],
    ["https://2gis.ru/", "twogis"],
    ["https://yandex.ru/", "search"],
    ["https://yandex.ru/maps/org/123", "yandex_maps"],
    ["https://www.google.com/", "search"],
  ])("%s → %s", (referrer, expected) => {
    expect(acquisitionSourceFromReferrer(referrer)).toBe(expected);
  });

  it("не считает источником свой сайт, пустой и битый Referer", () => {
    expect(acquisitionSourceFromReferrer("https://okno.business/alina", "okno.business")).toBeNull();
    expect(acquisitionSourceFromReferrer("")).toBeNull();
    expect(acquisitionSourceFromReferrer("не ссылка")).toBeNull();
    expect(acquisitionSourceFromReferrer("https://example.com/")).toBeNull();
  });
});

describe("resolveAcquisitionSource", () => {
  it("метка из ссылки важнее Referer, чужая метка игнорируется", () => {
    expect(
      resolveAcquisitionSource({ param: "avito", referrer: "https://vk.com/" }),
    ).toBe("avito");
    expect(
      resolveAcquisitionSource({ param: "<script>", referrer: "https://vk.com/" }),
    ).toBe("vk");
  });
});

describe("withAcquisitionSource", () => {
  it("добавляет метку к ссылке с параметрами и без", () => {
    expect(withAcquisitionSource("/alina/book", "vk")).toBe("/alina/book?from=vk");
    expect(withAcquisitionSource("/alina/book?date=1", "vk")).toBe("/alina/book?date=1&from=vk");
    expect(withAcquisitionSource("/alina/book", null)).toBe("/alina/book");
  });
});

describe("summarizeAcquisitionSources", () => {
  it("сортирует по числу записей, неопределённые — в конце", () => {
    expect(
      summarizeAcquisitionSources([null, null, null, "vk", "instagram", "instagram"]),
    ).toEqual([
      { source: "instagram", label: "Instagram", count: 2 },
      { source: "vk", label: "ВКонтакте", count: 1 },
      { source: null, label: "Не определён", count: 3 },
    ]);
  });
});
