import { DateTime } from "luxon";

// Скидки мастера (миграция 202610210001): на услугу по периоду, на первый
// визит и на горящие окошки. Один расчёт на всех: страница записи показывает
// по нему цену, а сервер по нему же кладёт итоговую цену в запись.
//
// Скидки не складываются — к визиту применяется самая большая из подходящих.
// Две скидки сразу мастер обычно не имеет в виду, а «−20% и ещё −15%» клиент
// всё равно не сосчитает.

export const maxDiscountPercent = 90;

export type DiscountKind = "period" | "first_visit" | "hot_windows";

export const discountKindLabels: Record<DiscountKind, string> = {
  period: "акция",
  first_visit: "первый визит",
  hot_windows: "горящие окошки",
};

export type ServiceDiscountSettings = {
  discountPercent: number | null;
  discountStartsOn: string | null; // ISO-дата, включительно; null — с сегодня
  discountEndsOn: string | null; // ISO-дата, включительно
  firstVisitDiscountPercent: number | null;
};

export type HotWindowsDiscount = {
  percent: number;
  untilIso: string; // визиты, которые начинаются раньше, — со скидкой
};

export type AppliedDiscount = { percent: number; kind: DiscountKind };

export function applyDiscount(price: number, percent: number) {
  return Math.max(0, Math.round((price * (100 - percent)) / 100));
}

function validPercent(value: number | null | undefined) {
  return typeof value === "number" && value >= 1 && value <= maxDiscountPercent
    ? value
    : null;
}

// Акция действует в дату визита (ISO, в поясе мастера).
export function isPeriodDiscountActiveOn(service: ServiceDiscountSettings, date: string) {
  if (!validPercent(service.discountPercent) || !service.discountEndsOn) return false;
  if (service.discountStartsOn && date < service.discountStartsOn) return false;
  return date <= service.discountEndsOn;
}

export function isHotWindowsDiscountActive(
  discount: HotWindowsDiscount | null | undefined,
  now: Date = new Date(),
): discount is HotWindowsDiscount {
  return Boolean(
    discount && validPercent(discount.percent) && new Date(discount.untilIso) > now,
  );
}

export function resolveBookingDiscount(input: {
  service: ServiceDiscountSettings;
  visitDate: string; // ISO-дата визита в поясе мастера
  visitStartIso: string;
  // null — ещё не знаем, новый ли клиент (на странице до ввода телефона).
  isFirstVisit: boolean | null;
  hotWindows?: HotWindowsDiscount | null;
  now?: Date;
}): AppliedDiscount | null {
  const candidates: AppliedDiscount[] = [];

  if (isPeriodDiscountActiveOn(input.service, input.visitDate)) {
    candidates.push({ percent: input.service.discountPercent!, kind: "period" });
  }

  const firstVisitPercent = validPercent(input.service.firstVisitDiscountPercent);
  if (input.isFirstVisit && firstVisitPercent) {
    candidates.push({ percent: firstVisitPercent, kind: "first_visit" });
  }

  if (
    isHotWindowsDiscountActive(input.hotWindows, input.now) &&
    new Date(input.visitStartIso) < new Date(input.hotWindows!.untilIso) &&
    new Date(input.visitStartIso) >= (input.now ?? new Date())
  ) {
    candidates.push({ percent: input.hotWindows!.percent, kind: "hot_windows" });
  }

  return candidates.reduce<AppliedDiscount | null>(
    (best, candidate) => (!best || candidate.percent > best.percent ? candidate : best),
    null,
  );
}

// Скидка на окошки в сторис действует до конца последнего показанного дня.
export function hotWindowsDiscountUntilIso(lastDay: string, timezone: string) {
  return (
    DateTime.fromISO(lastDay, { zone: timezone }).endOf("day").toUTC().toISO() ?? ""
  );
}

function formatDayMonth(date: string) {
  return DateTime.fromISO(date).setLocale("ru").toFormat("d MMMM");
}

// Подпись акции в каталоге: «до 31 октября», «с 1 по 15 ноября».
export function formatPeriodDiscountRange(service: ServiceDiscountSettings, today: string) {
  if (!service.discountEndsOn) return "";
  if (service.discountStartsOn && service.discountStartsOn > today) {
    return `с ${formatDayMonth(service.discountStartsOn)} по ${formatDayMonth(service.discountEndsOn)}`;
  }
  return `до ${formatDayMonth(service.discountEndsOn)}`;
}

// Что показать на карточке услуги в каталоге, пока клиент не выбрал время:
// акцию, если она идёт сегодня или ещё впереди.
export function currentPeriodDiscount(service: ServiceDiscountSettings, today: string) {
  const percent = validPercent(service.discountPercent);
  if (!percent || !service.discountEndsOn || service.discountEndsOn < today) return null;
  return {
    percent,
    label: formatPeriodDiscountRange(service, today),
    startsLater: Boolean(service.discountStartsOn && service.discountStartsOn > today),
  };
}

// Проверка настроек скидок на услуге — та же на сервере и в форме.
export function validateServiceDiscountSettings(
  settings: ServiceDiscountSettings,
): { ok: true } | { ok: false; message: string } {
  if (settings.discountPercent !== null) {
    if (!validPercent(settings.discountPercent)) {
      return { ok: false, message: `Скидка по акции — от 1 до ${maxDiscountPercent}%.` };
    }
    if (!settings.discountEndsOn) {
      return { ok: false, message: "Укажи, до какого дня действует акция." };
    }
    if (settings.discountStartsOn && settings.discountStartsOn > settings.discountEndsOn) {
      return { ok: false, message: "Акция заканчивается раньше, чем начинается." };
    }
  }

  if (
    settings.firstVisitDiscountPercent !== null &&
    !validPercent(settings.firstVisitDiscountPercent)
  ) {
    return { ok: false, message: `Скидка на первый визит — от 1 до ${maxDiscountPercent}%.` };
  }

  return { ok: true };
}

export const noServiceDiscounts: ServiceDiscountSettings = {
  discountPercent: null,
  discountStartsOn: null,
  discountEndsOn: null,
  firstVisitDiscountPercent: null,
};
