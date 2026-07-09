import { NextResponse } from "next/server";
import { getBookingCalendarData } from "@/lib/data";
import {
  buildBookingIcs,
  buildGoogleCalendarLink,
  detectCalendarPlatformFromUserAgent,
} from "@/lib/ics";
import { logError } from "@/lib/observability/logger";

type RouteParams = {
  params: Promise<{ bookingId: string }>;
};

// Отдает .ics-файл (или редиректит на Google Calendar, если явно попросили
// ?provider=google) по id записи. UID внутри .ics фиксированный
// (см. src/lib/ics.ts), так что повторное скачивание после переноса записи
// обновит существующее событие в календаре клиента, а не создаст дубль.
export async function GET(request: Request, { params }: RouteParams) {
  const { bookingId } = await params;

  if (!bookingId) {
    return NextResponse.json({ error: "Не указана запись." }, { status: 400 });
  }

  let booking: Awaited<ReturnType<typeof getBookingCalendarData>>;

  try {
    booking = await getBookingCalendarData(bookingId);
  } catch (error) {
    logError("Failed to load booking for calendar export", { bookingId, error });
    return NextResponse.json(
      { error: "Не получилось загрузить запись для календаря." },
      { status: 500 },
    );
  }

  if (!booking) {
    return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
  }

  const url = new URL(request.url);
  const requestedProvider = url.searchParams.get("provider");
  const userAgent = request.headers.get("user-agent");
  const detectedPlatform = detectCalendarPlatformFromUserAgent(userAgent);

  const wantsGoogleLink =
    requestedProvider === "google" ||
    (requestedProvider !== "ics" && detectedPlatform === "google");

  if (wantsGoogleLink) {
    const googleLink = buildGoogleCalendarLink({
      serviceTitle: booking.serviceTitle,
      masterName: booking.masterName,
      startsAtIso: booking.startsAtIso,
      endsAtIso: booking.endsAtIso,
      location: booking.location,
      note: booking.note,
    });

    if (!googleLink) {
      return NextResponse.json(
        { error: "Не получилось собрать ссылку на Google Calendar." },
        { status: 500 },
      );
    }

    return NextResponse.redirect(googleLink, { status: 302 });
  }

  const ics = buildBookingIcs({
    bookingId: booking.bookingId,
    serviceTitle: booking.serviceTitle,
    masterName: booking.masterName,
    startsAtIso: booking.startsAtIso,
    endsAtIso: booking.endsAtIso,
    location: booking.location,
    note: booking.note,
    reminderMinutesBefore: 120,
    createdAtIso: booking.updatedAtIso,
  });

  if (!ics) {
    return NextResponse.json(
      { error: "Не получилось собрать файл календаря." },
      { status: 500 },
    );
  }

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="okno-${booking.bookingId}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
