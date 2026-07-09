import { DateTime } from "luxon";
import { CancelBookingButton } from "@/components/forms/booking-operations";
import { Badge } from "@/components/ui/badge";
import type { Booking, Client, Service } from "@/lib/mock-data";

export function BookingCard({
  booking,
  clients,
  services,
  timezone,
  showDate,
  archived = false,
}: {
  booking: Booking;
  clients: Client[];
  services: Service[];
  timezone: string;
  showDate: boolean;
  archived?: boolean;
}) {
  const service = services.find((item) => item.id === booking.serviceId);
  const client = clients.find((item) => item.id === booking.clientId);
  const startsAt = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
    timezone,
  );

  return (
    <div className="w-full max-w-full rounded-[24px] border border-line p-4">
      <div className="grid w-full max-w-full gap-4 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-start">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-ink">{client?.name}</p>
          <p className="text-sm text-ink-soft">
            {service?.title} • {startsAt.toFormat("HH:mm")}
          </p>
          {showDate ? (
            <p className="text-sm text-muted">
              Дата визита: {startsAt.setLocale("ru").toFormat("d LLLL")}
            </p>
          ) : null}
          {booking.clientNote ? (
            <p
              className="max-w-full overflow-hidden whitespace-pre-wrap text-sm leading-6 text-muted"
              style={{
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              Комментарий клиента: {booking.clientNote}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col items-start gap-3 sm:items-end">
          <Badge tone={archived ? "neutral" : "success"}>
            {archived ? "В архиве" : "Подтверждено"}
          </Badge>
          {!archived ? (
            <div className="w-full sm:w-[15rem]">
              <CancelBookingButton bookingId={booking.id} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
