// Серверная сторона справочника городов: формы присылают id города (или
// название из старых данных), а здесь из него получаются подпись для профиля
// и часовой пояс. В клиентские компоненты этот модуль не импортировать —
// он тянет весь JSON; поле выбора грузит его само (components/ui/city-picker).
import catalogData from "./city-catalog.json";
import {
  defaultCityLabel,
  defaultTimezone,
  findCity,
  type City,
  type CityCatalog,
} from "./city-catalog";

const catalog = catalogData as CityCatalog;

export { defaultTimezone };

const defaultCity: City = findCity(catalog, defaultCityLabel) ?? {
  value: defaultCityLabel,
  label: defaultCityLabel,
  region: "",
  timezone: defaultTimezone,
};

export const defaultCityValue = defaultCity.value;

export function getCityOption(value?: string | null, timezoneHint?: string | null) {
  return findCity(catalog, value, timezoneHint) ?? defaultCity;
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
  const city =
    findCity(catalog, input.city) ??
    findCity(catalog, input.locationText, input.timezone);
  if (city) return city.value;

  if (input.timezone) {
    const sameZone = catalog.cities.find(
      (row) => catalog.timezones[row[3]] === input.timezone,
    );
    if (sameZone) return String(sameZone[0]);
  }

  return defaultCityValue;
}
