// Справочник городов СНГ (src/lib/city-catalog.json, собирается
// scripts/build-city-catalog.py из GeoNames). Тут только чистые функции над
// ним: сам JSON весит ~450 КБ, поэтому сервер подключает его статически
// (lib/cities.ts), а поле выбора города подгружает отдельным чанком.

// [id GeoNames, название, индекс региона, индекс часового пояса, синонимы?]
type CityRow = [number, string, number, number, string[]?];

export type CityCatalog = {
  regions: string[];
  timezones: string[];
  // Отсортированы по населению: при совпадении названий первым идёт крупный.
  cities: CityRow[];
};

export type City = {
  value: string;
  label: string;
  region: string;
  timezone: string;
};

export const defaultCityLabel = "Симферополь";
export const defaultTimezone = "Europe/Simferopol";

// Значения из старого короткого списка: могли остаться в черновиках форм.
const legacySlugs: Record<string, string> = {
  moscow: "Москва",
  "saint-petersburg": "Санкт-Петербург",
  simferopol: "Симферополь",
  sochi: "Сочи",
  kazan: "Казань",
  kaliningrad: "Калининград",
  samara: "Самара",
  yekaterinburg: "Екатеринбург",
  omsk: "Омск",
  novosibirsk: "Новосибирск",
  krasnoyarsk: "Красноярск",
  irkutsk: "Иркутск",
  yakutsk: "Якутск",
  vladivostok: "Владивосток",
  magadan: "Магадан",
  "petropavlovsk-kamchatsky": "Петропавловск-Камчатский",
};

export function normalizeCityQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[-‐–—]/g, " ")
    .replace(/[.,’'‘`«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type CityIndex = { names: string[]; aliases: (string[] | undefined)[] };
const indexCache = new WeakMap<CityCatalog, CityIndex>();

function getIndex(catalog: CityCatalog): CityIndex {
  let index = indexCache.get(catalog);
  if (!index) {
    index = {
      names: catalog.cities.map((row) => normalizeCityQuery(row[1])),
      aliases: catalog.cities.map((row) => row[4]?.map(normalizeCityQuery)),
    };
    indexCache.set(catalog, index);
  }
  return index;
}

function toCity(catalog: CityCatalog, row: CityRow): City {
  return {
    value: String(row[0]),
    label: row[1],
    region: catalog.regions[row[2]] ?? "",
    timezone: catalog.timezones[row[3]] ?? defaultTimezone,
  };
}

// Понимает id из справочника, старый slug и название (как оно хранится в
// профиле). Одинаковых названий много — «Октябрьский» встречается десятки раз,
// — поэтому при подсказке часового пояса берём совпадение с ним, иначе самый
// крупный город.
export function findCity(
  catalog: CityCatalog,
  input: string | null | undefined,
  timezoneHint?: string | null,
): City | null {
  const raw = input?.trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    const row = catalog.cities.find((city) => city[0] === id);
    return row ? toCity(catalog, row) : null;
  }

  const query = normalizeCityQuery(legacySlugs[raw] ?? raw);
  const { names, aliases } = getIndex(catalog);
  let first: CityRow | null = null;

  for (let i = 0; i < catalog.cities.length; i += 1) {
    if (names[i] !== query && !aliases[i]?.includes(query)) continue;
    const row = catalog.cities[i];
    if (!timezoneHint || catalog.timezones[row[3]] === timezoneHint) {
      return toCity(catalog, row);
    }
    first ??= row;
  }

  return first ? toCity(catalog, first) : null;
}

// Сначала города, чьё название или синоним («питер») начинается с запроса,
// потом те, где запрос стоит в начале другого слова. Внутри групп — по населению.
export function searchCities(catalog: CityCatalog, input: string, limit = 30): City[] {
  const query = normalizeCityQuery(input);
  if (!query) {
    return catalog.cities.slice(0, limit).map((row) => toCity(catalog, row));
  }

  const { names, aliases } = getIndex(catalog);
  const prefix: CityRow[] = [];
  const inner: CityRow[] = [];

  for (let i = 0; i < catalog.cities.length && prefix.length < limit; i += 1) {
    const name = names[i];
    if (name.startsWith(query) || aliases[i]?.some((alias) => alias.startsWith(query))) {
      prefix.push(catalog.cities[i]);
    } else if (inner.length < limit && name.includes(` ${query}`)) {
      inner.push(catalog.cities[i]);
    }
  }

  return [...prefix, ...inner].slice(0, limit).map((row) => toCity(catalog, row));
}
