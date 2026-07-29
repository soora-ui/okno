import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { Archive, ArrowLeft } from "lucide-react";
import { BookingCard } from "@/components/dashboard/booking-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { pluralizeRu } from "@/lib/utils";
import { getDashboardData } from "@/lib/data";

export default async function ArchivePage() {
  const data = await getDashboardData();

  if (!data) {
    redirect("/login");
  }

  const { bookings, clients, profile, services } = data;
  const now = DateTime.now().setZone(profile.timezone);
  const todayKey = now.toFormat("yyyy-MM-dd");
  const archivedBookings = bookings
    .filter((booking) => booking.status === "confirmed")
    .map((booking) => ({
      booking,
      startsAt: DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
        profile.timezone,
      ),
    }))
    .filter(({ startsAt }) => startsAt < now && startsAt.toFormat("yyyy-MM-dd") !== todayKey)
    .sort((left, right) => right.startsAt.toMillis() - left.startsAt.toMillis())
    .map(({ booking }) => booking);

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge tone="accent">Архив записей</Badge>
          <h1 className="text-4xl font-semibold text-ink">Прошедшие визиты</h1>
          <p className="max-w-2xl text-sm leading-7 text-ink-soft">
            Здесь собраны завершенные записи, чтобы дашборд оставался сфокусированным на
            сегодняшнем дне и ближайших визитах.
          </p>
        </div>
        <ButtonLink href="/dashboard" variant="secondary" className="gap-2">
          <ArrowLeft size={16} />
          Назад в кабинет
        </ButtonLink>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Archive size={18} className="text-accent-deep" />
              <h2 className="text-2xl font-semibold text-ink">Архив</h2>
            </div>
            <p className="text-sm text-muted">
              {archivedBookings.length > 0
                ? pluralizeRu(
                    archivedBookings.length,
                    "завершённый визит",
                    "завершённых визита",
                    "завершённых визитов",
                  )
                : "Пока без прошедших записей"}
            </p>
          </div>
        </div>

        {archivedBookings.length > 0 ? (
          <div className="space-y-3">
            {archivedBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                clients={clients}
                services={services}
                timezone={profile.timezone}
                showDate
                archived
                lateCancelThresholdHours={profile.lateCancelThresholdHours}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Архив пока пуст"
            description="Как только визиты начнут завершаться, они появятся здесь отдельным списком."
            ctaLabel="Вернуться в кабинет"
            ctaHref="/dashboard"
          />
        )}
      </Card>
    </div>
  );
}
