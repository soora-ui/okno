import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { Lock, Rows3 } from "lucide-react";
import { BlockedSlotsForm } from "@/components/forms/blocked-slots-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Booking } from "@/lib/mock-data";
import { getScheduleData } from "@/lib/data";
import { cn } from "@/lib/utils";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const scheduleViews = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
] as const;

type ScheduleView = (typeof scheduleViews)[number]["id"];
type SchedulePageProps = {
  searchParams: Promise<{
    view?: string;
  }>;
};

function formatScheduleLabel(dateIso: string, timezone: string) {
  return DateTime.fromISO(dateIso, { zone: "utc" })
    .setZone(timezone)
    .setLocale("ru");
}

function pluralizeScheduleBookings(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "запись";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "записи";
  }

  return "записей";
}

function buildScheduleGroups(
  bookings: Booking[],
  timezone: string,
  view: ScheduleView,
) {
  const groups = new Map<string, { label: string; bookings: Booking[] }>();

  bookings.forEach((booking) => {
    const startsAt = formatScheduleLabel(booking.startsAt, timezone);
    let groupKey = startsAt.toFormat("yyyy-MM-dd");
    let label = startsAt.toFormat("cccc, d LLLL");

    if (view === "week") {
      const startOfWeek = startsAt.startOf("week");
      const endOfWeek = startOfWeek.plus({ days: 6 });

      groupKey = startOfWeek.toFormat("kkkk-'W'WW");
      label = `${startOfWeek.toFormat("d LLLL")} - ${endOfWeek.toFormat("d LLLL")}`;
    }

    if (view === "month") {
      groupKey = startsAt.toFormat("yyyy-MM");
      label = startsAt.toFormat("LLLL yyyy");
    }

    const existingGroup = groups.get(groupKey);

    if (existingGroup) {
      existingGroup.bookings.push(booking);
      return;
    }

    groups.set(groupKey, {
      label,
      bookings: [booking],
    });
  });

  return Array.from(groups.entries()).map(([key, group]) => ({
    id: key,
    label: group.label,
    bookings: group.bookings,
  }));
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const data = await getScheduleData();

  if (!data) {
    redirect("/login");
  }

  const { availabilityRules, blockedSlots, bookings, profile } = data;
  const activeBookings = bookings.filter((booking) => booking.status === "confirmed");
  const { view: rawView } = await searchParams;
  const view: ScheduleView = scheduleViews.some((item) => item.id === rawView)
    ? (rawView as ScheduleView)
    : "day";
  const bookingGroups = buildScheduleGroups(activeBookings, profile.timezone, view);

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge tone="accent">Расписание</Badge>
          <h1 className="text-4xl font-semibold text-ink">Расписание и блокировки</h1>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4">
          <div className="inline-flex w-fit rounded-full border border-line bg-panel p-1">
            {scheduleViews.map((item) => (
              <Link
                key={item.id}
                href={`/schedule?view=${item.id}`}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition",
                  item.id === view
                    ? "bg-surface text-ink shadow-sm"
                    : "text-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="space-y-6">
            {bookingGroups.map((group) => (
              <div key={group.id} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">{group.label}</h2>
                  <span className="text-sm text-muted">
                    {group.bookings.length} {pluralizeScheduleBookings(group.bookings.length)}
                  </span>
                </div>
                <div className="grid gap-3">
                  {group.bookings.map((booking) => {
                    const startsAt = formatScheduleLabel(booking.startsAt, profile.timezone);
                    const endsAt = formatScheduleLabel(booking.endsAt, profile.timezone);

                    return (
                      <div
                        key={booking.id}
                        className="rounded-[24px] border border-line p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-ink">
                              {startsAt.toFormat("cccc, d LLLL")}
                            </p>
                            <p className="mt-1 text-sm text-ink-soft">
                              {startsAt.toFormat("HH:mm")} - {endsAt.toFormat("HH:mm")}
                            </p>
                          </div>
                          <Badge tone="success">Занято</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Rows3 size={18} className="text-accent-deep" />
              <h2 className="text-xl font-semibold text-ink">Рабочие часы</h2>
            </div>
            <div className="space-y-3">
              {availabilityRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between rounded-[20px] bg-panel px-4 py-3">
                  <p className="font-medium text-ink">{weekdays[rule.weekday - 1]}</p>
                  <p className="text-sm text-ink-soft">
                    {rule.startTime} - {rule.endTime}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Lock size={18} className="text-warning" />
              <h2 className="text-xl font-semibold text-ink">Ручные блокировки</h2>
            </div>
            <BlockedSlotsForm
              blockedSlots={blockedSlots}
              timezone={profile.timezone}
              defaultDate={DateTime.now().setZone(profile.timezone).toISODate() ?? ""}
            />
          </Card>

          {availabilityRules.length === 0 ? (
            <EmptyState
              title="Рабочие часы пока не заданы"
              description="Пока в расписании нет ни одного рабочего дня, клиенты не увидят свободного времени на странице записи."
              ctaLabel="Настроить рабочие часы"
              ctaHref="/settings"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
