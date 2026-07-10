import { DateTime } from "luxon";
import { publicLinkHost } from "@/lib/site";

// Собираем .ics руками — формат простой (RFC 5545), внешняя либа не нужна.
// UID фиксированный и привязан к id записи: при переносе/изменении записи
// клиенты (Apple Calendar, большинство Android-приложений, Outlook) обновят
// существующее событие вместо создания дубля, если .ics скачивается заново.
const ICS_LINE_LIMIT = 73;

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// RFC 5545 требует "folding" строк длиннее 75 октетов: перенос с ведущим
// пробелом на новой строке. Без этого некоторые клиенты обрежут длинные поля.
function foldIcsLine(line: string) {
  if (line.length <= ICS_LINE_LIMIT) {
    return line;
  }

  const chunks: string[] = [];
  let rest = line;

  while (rest.length > ICS_LINE_LIMIT) {
    chunks.push(rest.slice(0, ICS_LINE_LIMIT));
    rest = rest.slice(ICS_LINE_LIMIT);
  }
  chunks.push(rest);

  return chunks.join("\r\n ");
}

function toIcsUtcStamp(iso: string) {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  return dt.isValid ? dt.toFormat("yyyyMMdd'T'HHmmss'Z'") : "";
}

export function buildBookingCalendarUid(bookingId: string) {
  return `${bookingId}@${publicLinkHost}`;
}

export function buildBookingIcs(input: {
  bookingId: string;
  serviceTitle: string;
  masterName: string;
  startsAtIso: string;
  endsAtIso: string;
  location?: string;
  note?: string;
  reminderMinutesBefore?: number;
  createdAtIso?: string;
  sequence?: number;
}) {
  const {
    bookingId,
    serviceTitle,
    masterName,
    startsAtIso,
    endsAtIso,
    location = "",
    note = "",
    reminderMinutesBefore = 120,
    createdAtIso,
    sequence = 0,
  } = input;

  const dtStart = toIcsUtcStamp(startsAtIso);
  const dtEnd = toIcsUtcStamp(endsAtIso);
  const dtStamp = toIcsUtcStamp(createdAtIso ?? new Date().toISOString());

  if (!dtStart || !dtEnd) {
    return null;
  }

  const summary = escapeIcsText(`${serviceTitle} — ${masterName}`);
  const description = escapeIcsText(
    [`Запись к ${masterName}`, serviceTitle, note].filter(Boolean).join("\n"),
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//okno.business//booking-reminders//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${buildBookingCalendarUid(bookingId)}`,
    `SEQUENCE:${Math.max(0, sequence)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:Напоминание: ${summary}`,
    `TRIGGER:-PT${Math.max(1, reminderMinutesBefore)}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

// Прямая ссылка на добавление события в Google Calendar — удобнее .ics для
// Android и большинства не-Apple окружений, где скачивание файла календаря
// не так интуитивно.
export function buildGoogleCalendarLink(input: {
  serviceTitle: string;
  masterName: string;
  startsAtIso: string;
  endsAtIso: string;
  location?: string;
  note?: string;
}) {
  const dtStart = toIcsUtcStamp(input.startsAtIso);
  const dtEnd = toIcsUtcStamp(input.endsAtIso);

  if (!dtStart || !dtEnd) {
    return null;
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${input.serviceTitle} — ${input.masterName}`,
    dates: `${dtStart}/${dtEnd}`,
    details: [`Запись к ${input.masterName}`, input.serviceTitle, input.note ?? ""]
      .filter(Boolean)
      .join("\n"),
  });

  if (input.location) {
    params.set("location", input.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Простая эвристика по User-Agent: Apple-платформы (и десктопный Safari)
// заметно удобнее работают с прямым .ics-файлом (открывается нативно в
// Calendar.app), остальные (Android/Windows/прочее) — с прямой ссылкой на
// Google Calendar. Точное определение не нужно: UI всегда показывает обе
// опции, эвристика лишь выбирает, какая идет первой/по умолчанию.
export type CalendarClientPlatform = "apple" | "google" | "other";

export function detectCalendarPlatformFromUserAgent(
  userAgent: string | null | undefined,
): CalendarClientPlatform {
  if (!userAgent) {
    return "other";
  }

  const ua = userAgent.toLowerCase();
  const isApple =
    /iphone|ipad|ipod|macintosh|mac os x/.test(ua) && !/windows/.test(ua);

  if (isApple) {
    return "apple";
  }

  if (/android/.test(ua)) {
    return "google";
  }

  return "other";
}
