// Источники записей (документы/источники-записей.md): откуда клиент пришёл
// на страницу записи. Мастер ставит в соцсети ссылку с меткой
// (okno.business/alina?from=instagram), а если метки нет — догадываемся по
// Referer. Только наши данные: без сторонних счётчиков и без cookie.

export const acquisitionSources = [
  "instagram",
  "telegram",
  "vk",
  "whatsapp",
  "avito",
  "yandex_maps",
  "twogis",
  "search",
] as const;

export type AcquisitionSource = (typeof acquisitionSources)[number];

export const acquisitionSourceLabels: Record<AcquisitionSource, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  vk: "ВКонтакте",
  whatsapp: "WhatsApp",
  avito: "Авито",
  yandex_maps: "Яндекс Карты",
  twogis: "2ГИС",
  search: "Поиск",
};

// Каналы, для которых мастер получает ссылку с меткой. «Поиск» только
// определяется сам: ссылку в выдачу Яндекса мастер не вставляет.
export const taggableAcquisitionSources = acquisitionSources.filter(
  (source) => source !== "search",
);

export const acquisitionSourceParam = "from";

export function parseAcquisitionSource(value: unknown): AcquisitionSource | null {
  return typeof value === "string" &&
    (acquisitionSources as readonly string[]).includes(value)
    ? (value as AcquisitionSource)
    : null;
}

// Домен → канал. Браузеры обычно отдают в Referer только origin, поэтому
// yandex.ru без пути — это поиск: отличить Карты от выдачи по нему нельзя.
// Instagram и часть мессенджеров Referer вырезают — для них и нужна метка.
const referrerHosts: Array<[RegExp, AcquisitionSource]> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, "telegram"],
  [/(^|\.)(vk\.com|vk\.ru|vk\.me)$/, "vk"],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, "whatsapp"],
  [/(^|\.)avito\.ru$/, "avito"],
  [/(^|\.)(2gis\.[a-z]+)$/, "twogis"],
  [/(^|\.)(google\.[a-z.]+|yandex\.[a-z]+|ya\.ru|bing\.com|duckduckgo\.com|mail\.ru)$/, "search"],
];

export function acquisitionSourceFromReferrer(
  referrer: string | null | undefined,
  ownHost?: string,
): AcquisitionSource | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  // Переход внутри сайта (со страницы мастера на форму) — не источник.
  if (ownHost && host === ownHost.toLowerCase()) return null;
  // Карты Яндекса иногда отдают путь — тогда их можно отличить от поиска.
  if (/(^|\.)yandex\.[a-z]+$/.test(host) && new URL(referrer).pathname.startsWith("/maps")) {
    return "yandex_maps";
  }
  return referrerHosts.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

// Метка из ссылки важнее Referer: её поставил мастер осознанно.
export function resolveAcquisitionSource(input: {
  param: unknown;
  referrer: string | null | undefined;
  ownHost?: string;
}): AcquisitionSource | null {
  return (
    parseAcquisitionSource(input.param) ??
    acquisitionSourceFromReferrer(input.referrer, input.ownHost)
  );
}

export function withAcquisitionSource(href: string, source: AcquisitionSource | null) {
  if (!source) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${acquisitionSourceParam}=${source}`;
}

export type AcquisitionSourceStat = {
  source: AcquisitionSource | null;
  label: string;
  count: number;
};

// Сводка для кабинета: каналы по убыванию, «не определён» — всегда последним,
// чтобы не заслонять каналы, которые мастер может усилить.
export function summarizeAcquisitionSources(
  sources: Array<AcquisitionSource | null>,
): AcquisitionSourceStat[] {
  const counts = new Map<AcquisitionSource | null, number>();
  for (const source of sources) counts.set(source, (counts.get(source) ?? 0) + 1);

  return [...counts.entries()]
    .map(([source, count]) => ({
      source,
      label: source ? acquisitionSourceLabels[source] : "Не определён",
      count,
    }))
    .sort((left, right) => {
      if (left.source === null) return 1;
      if (right.source === null) return -1;
      return right.count - left.count;
    });
}
