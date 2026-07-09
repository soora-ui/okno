const cityCatalog = [
  { value: "moscow", label: "Москва", timezone: "Europe/Moscow", aliases: ["москва"] },
  {
    value: "saint-petersburg",
    label: "Санкт-Петербург",
    timezone: "Europe/Moscow",
    aliases: ["санкт-петербург", "санкт петербург", "петербург", "спб"],
  },
  { value: "simferopol", label: "Симферополь", timezone: "Europe/Simferopol", aliases: ["симферополь"] },
  { value: "sochi", label: "Сочи", timezone: "Europe/Moscow", aliases: ["сочи"] },
  { value: "kazan", label: "Казань", timezone: "Europe/Moscow", aliases: ["казань"] },
  { value: "kaliningrad", label: "Калининград", timezone: "Europe/Kaliningrad", aliases: ["калининград"] },
  { value: "samara", label: "Самара", timezone: "Europe/Samara", aliases: ["самара"] },
  { value: "yekaterinburg", label: "Екатеринбург", timezone: "Asia/Yekaterinburg", aliases: ["екатеринбург"] },
  { value: "omsk", label: "Омск", timezone: "Asia/Omsk", aliases: ["омск"] },
  { value: "novosibirsk", label: "Новосибирск", timezone: "Asia/Novosibirsk", aliases: ["новосибирск"] },
  { value: "krasnoyarsk", label: "Красноярск", timezone: "Asia/Krasnoyarsk", aliases: ["красноярск"] },
  { value: "irkutsk", label: "Иркутск", timezone: "Asia/Irkutsk", aliases: ["иркутск"] },
  { value: "yakutsk", label: "Якутск", timezone: "Asia/Yakutsk", aliases: ["якутск"] },
  { value: "vladivostok", label: "Владивосток", timezone: "Asia/Vladivostok", aliases: ["владивосток"] },
  { value: "magadan", label: "Магадан", timezone: "Asia/Magadan", aliases: ["магадан"] },
  {
    value: "petropavlovsk-kamchatsky",
    label: "Петропавловск-Камчатский",
    timezone: "Asia/Kamchatka",
    aliases: ["петропавловск-камчатский", "петропавловск камчатский", "камчатка"],
  },
] as const;

export const defaultCityValue = "simferopol";
export const defaultTimezone = "Europe/Simferopol";

export const cityOptions = cityCatalog.map((city) => ({
  value: city.value,
  label: city.label,
}));

function normalizeCityInput(value: string) {
  return value.trim().toLowerCase().replace(/[.,]/g, "");
}

export function getCityOption(value?: string | null) {
  if (!value) {
    return cityCatalog.find((city) => city.value === defaultCityValue) ?? cityCatalog[0];
  }

  const normalizedValue = normalizeCityInput(value);
  return (
    cityCatalog.find(
      (city) =>
        city.value === value ||
        normalizeCityInput(city.label) === normalizedValue ||
        city.aliases.some((alias) => normalizeCityInput(alias) === normalizedValue),
    ) ??
    cityCatalog.find((city) => city.value === defaultCityValue) ??
    cityCatalog[0]
  );
}

export function getCityLabel(value?: string | null) {
  return getCityOption(value).label;
}

export function resolveTimezoneForCity(value?: string | null) {
  return getCityOption(value).timezone;
}

export function resolveCityValue(input: {
  city?: string | null;
  locationText?: string | null;
  timezone?: string | null;
}) {
  if (input.city) {
    return getCityOption(input.city).value;
  }

  if (input.locationText) {
    const fromLocation = getCityOption(input.locationText);
    if (fromLocation) {
      return fromLocation.value;
    }
  }

  if (input.timezone) {
    const fromTimezone = cityCatalog.find((city) => city.timezone === input.timezone);
    if (fromTimezone) {
      return fromTimezone.value;
    }
  }

  return defaultCityValue;
}
