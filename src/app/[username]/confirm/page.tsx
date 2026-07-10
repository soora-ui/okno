import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { AddToCalendar } from "@/components/booking/add-to-calendar";
import { SiteShell } from "@/components/layout/site-shell";
import { TipForm } from "@/components/booking/tip-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBookingThemeStyle } from "@/lib/booking-theme-presets";
import { getBookingConfirmationData } from "@/lib/data";
import { detectCalendarPlatformFromUserAgent } from "@/lib/ics";

type ConfirmPageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{
    bookingId?: string;
    cancelToken?: string;
  }>;
};

export default async function ConfirmPage({
  params,
  searchParams,
}: ConfirmPageProps) {
  const { username } = await params;
  const query = await searchParams;
  const bookingId =
    typeof query.bookingId === "string" ? query.bookingId : "";
  const cancelToken =
    typeof query.cancelToken === "string" ? query.cancelToken : "";
  const booking = await getBookingConfirmationData(username, bookingId);

  if (!booking) {
    notFound();
  }

  const requestHeaders = await headers();
  const calendarPlatform = detectCalendarPlatformFromUserAgent(
    requestHeaders.get("user-agent"),
  );

  return (
    <SiteShell compact hideGuestMenu resolveAuth={false}>
      <div
        style={getBookingThemeStyle(booking.themePresetId)}
        className="mx-auto max-w-3xl py-10"
      >
        <div
          className="rounded-[36px] p-4 sm:p-6"
          style={{
            backgroundImage:
              "radial-gradient(circle at top left, var(--public-glow-a), transparent 30%), radial-gradient(circle at 80% 20%, var(--public-glow-b), transparent 24%), radial-gradient(circle at bottom right, var(--public-glow-c), transparent 32%)",
          }}
        >
          <Card className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
              <CheckCircle2 size={28} className="text-success" />
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold text-ink">Запись подтверждена</h1>
              <p className="text-sm leading-7 text-ink-soft">
                {booking.clientName}, запись принята. Сохрани это время, чтобы не потерять его.
              </p>
            </div>
            <div className="rounded-[28px] bg-panel p-5 text-left">
              <p className="font-medium text-ink">{booking.serviceTitle}</p>
              <p className="mt-2 text-sm text-ink-soft">{booking.startsAtLabel}</p>
            </div>
            {booking.bookingId ? (
              <AddToCalendar bookingId={booking.bookingId} platform={calendarPlatform} />
            ) : null}
            <TipForm bookingId={booking.bookingId} />
            <div className="flex flex-wrap justify-center gap-3">
              {cancelToken ? (
                <ButtonLink href={`/cancel/${cancelToken}`} variant="secondary">
                  Перенести или отменить
                </ButtonLink>
              ) : null}
              <ButtonLink href={`/${username}`}>Вернуться к мастеру</ButtonLink>
            </div>
          </Card>
        </div>
      </div>
    </SiteShell>
  );
}
