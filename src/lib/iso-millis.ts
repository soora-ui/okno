import { DateTime } from "luxon";

// Даты из базы приходят с явным смещением («…+00:00») — их точно разбирает
// Date.parse, а fromISO у luxon на сотнях записей мастера заметно дороже.
// Без смещения строку читаем как UTC через luxon: Date.parse принял бы её
// за местное время сервера. Нечитаемая строка даёт NaN, как toMillis() у
// невалидной даты luxon.
const ISO_WITH_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;

export function isoToMillis(iso: string) {
  if (ISO_WITH_OFFSET.test(iso)) {
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return DateTime.fromISO(iso, { zone: "utc" }).toMillis();
}
