import { DateTime } from "luxon";
import type { BookingSlot, Service } from "@/lib/mock-data";

// Горящие окошки (документы/горящие-окошки.md): свободное время мастера на
// ближайшие дни, которым он делится в сторис и мессенджерах.
//
// Считаем не по графику заново, а из той же выдачи слотов, что видит клиент
// на странице записи: там уже учтены блокировки, записи под предоплату,
// перерывы после услуг и прошедшее время. Окошко, которое мастер показал,
// клиент точно сможет забронировать.

export const freeWindowsDaysAhead = 3;

export type FreeWindow = {
  start: string; // HH:mm
  end: string; // HH:mm
  // Услуга, которая начинается ровно в начале окошка: на неё ведёт ссылка
  // записи, чтобы клиент сразу попал на это время.
  serviceId: string;
};

export type FreeWindowDay = {
  date: string; // ISO, 2026-10-19
  label: string; // «Сегодня, 19 октября»
  // То же по частям — карточке в кабинете они нужны разными шрифтами.
  dayName: string; // «Сегодня»
  dateLabel: string; // «19 октября»
  windows: FreeWindow[];
};

function toMinutes(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function fromMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function formatFreeWindowDayParts(date: DateTime, today: DateTime) {
  const dayDiff = Math.round(date.startOf("day").diff(today.startOf("day"), "days").days);
  const dateLabel = date.setLocale("ru").toFormat("d MMMM");
  const relative = ["Сегодня", "Завтра", "Послезавтра"][dayDiff];
  const weekday = date.setLocale("ru").toFormat("cccc");
  const dayName = relative ?? `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
  return { dayName, dateLabel, label: `${dayName}, ${dateLabel}` };
}

export function buildFreeWindows(input: {
  services: Service[];
  bookingSlotsByService: Record<string, BookingSlot[]>;
  timezone: string;
  daysAhead?: number;
  now?: DateTime;
}): FreeWindowDay[] {
  const { services, bookingSlotsByService, timezone, daysAhead = freeWindowsDaysAhead } = input;
  const today = (input.now ?? DateTime.now()).setZone(timezone).startOf("day");
  const result: FreeWindowDay[] = [];

  for (let offset = 0; offset < daysAhead; offset += 1) {
    const day = today.plus({ days: offset });
    const dayKey = day.toISODate() ?? "";

    // Порядок услуг как на странице мастера: при равном начале окошка ссылка
    // ведёт на ту, что мастер поставил выше.
    const intervals = services
      .filter((service) => service.isActive)
      .flatMap((service) => {
        const slot = bookingSlotsByService[service.id]?.find((item) => item.value === dayKey);
        return (slot?.times ?? []).map((time) => ({
          start: toMinutes(time),
          end: toMinutes(time) + service.durationMinutes,
          serviceId: service.id,
        }));
      })
      // sort стабилен: при равном начале сохраняется порядок услуг.
      .sort((left, right) => left.start - right.start);

    const windows: { start: number; end: number; serviceId: string }[] = [];
    for (const interval of intervals) {
      const last = windows.at(-1);
      // Смежные отрезки склеиваем: 14:00–15:00 и 15:00–16:00 для клиента —
      // одно окошко 14:00–16:00.
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        windows.push({ ...interval });
      }
    }

    if (windows.length === 0) continue;

    result.push({
      date: dayKey,
      ...formatFreeWindowDayParts(day, today),
      windows: windows.map((window) => ({
        start: fromMinutes(window.start),
        end: fromMinutes(window.end),
        serviceId: window.serviceId,
      })),
    });
  }

  return result;
}

export function formatFreeWindowRanges(windows: FreeWindow[], separator = ", ") {
  return windows.map((window) => `${window.start}–${window.end}`).join(separator);
}

export type FreeWindowsTimelineAxis = {
  startMinutes: number;
  endMinutes: number;
  ticks: string[]; // «09», «12», … — пять меток через равный шаг
};

// Шкала для таймлайна в кабинете: по умолчанию 09–21, раздвигается, если
// окошки выходят за неё. Шаг меток — целые часы, поэтому длину шкалы
// округляем вверх до кратной четырём (пять меток — четыре промежутка).
export function buildFreeWindowsTimelineAxis(days: FreeWindowDay[]): FreeWindowsTimelineAxis {
  const windows = days.flatMap((day) => day.windows);
  const earliest = Math.min(9 * 60, ...windows.map((window) => toMinutes(window.start)));
  const latest = Math.max(21 * 60, ...windows.map((window) => toMinutes(window.end)));
  let startHour = Math.floor(earliest / 60);
  const step = Math.ceil((Math.ceil(latest / 60) - startHour) / 4);
  if (startHour + step * 4 > 24) startHour = Math.max(0, 24 - step * 4);

  return {
    startMinutes: startHour * 60,
    endMinutes: (startHour + step * 4) * 60,
    ticks: [0, 1, 2, 3, 4].map((index) =>
      String(Math.min(24, startHour + step * index)).padStart(2, "0"),
    ),
  };
}

// Положение окошка на шкале в процентах — для left/width полоски.
export function freeWindowTimelineSegment(window: FreeWindow, axis: FreeWindowsTimelineAxis) {
  const span = axis.endMinutes - axis.startMinutes;
  const start = Math.max(axis.startMinutes, toMinutes(window.start));
  const end = Math.min(axis.endMinutes, toMinutes(window.end));
  return {
    leftPct: ((start - axis.startMinutes) / span) * 100,
    widthPct: (Math.max(0, end - start) / span) * 100,
  };
}

// Пост для Telegram / VK / WhatsApp. Пишем от лица мастера и без эмодзи:
// мастер вставит свои, если захочет, а лишние удалять неудобно.
export function buildFreeWindowsShareText(days: FreeWindowDay[], bookingUrl: string) {
  const lines = days.map((day) => `${day.label}: ${formatFreeWindowRanges(day.windows)}`);
  return [
    "Есть свободные окошки на ближайшие дни:",
    "",
    ...lines,
    "",
    `Записаться онлайн: ${bookingUrl}`,
  ].join("\n");
}
