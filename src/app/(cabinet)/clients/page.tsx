import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import {
  ClientDirectory,
  type ClientDirectoryHistoryItem,
  type ClientDirectoryItem,
} from "@/components/clients/client-directory";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buildReliabilityBadge, computeReliabilityAggregate } from "@/lib/client-reliability";
import { getClientsData } from "@/lib/data";
import { getReviewsForProfile, summarizeReviews, type ReviewWithContext } from "@/lib/reviews";
import { hasCapability } from "@/lib/subscription";
import type { Booking, Client, Service } from "@/lib/mock-data";

function formatVisitMoment(startsAt: string, timezone: string) {
  return DateTime.fromISO(startsAt, { zone: "utc" })
    .setZone(timezone)
    .setLocale("ru")
    .toFormat("d LLLL, HH:mm");
}

function formatReturnFrequency(bookings: Booking[], timezone: string) {
  if (bookings.length < 2) {
    return "Пока рано оценивать";
  }

  const sortedDates = bookings
    .map((booking) =>
      DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(timezone),
    )
    .sort((left, right) => left.toMillis() - right.toMillis());

  const gaps = sortedDates
    .slice(1)
    .map((date, index) => Math.max(1, Math.round(date.diff(sortedDates[index], "days").days)));

  const averageGap = Math.max(
    1,
    Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
  );

  return `В среднем раз в ${averageGap} дн.`;
}

function formatVisitCountLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} визит`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} визита`;
  }

  return `${count} визитов`;
}

function buildClientDirectoryItems(input: {
  clients: Client[];
  bookings: Booking[];
  services: Service[];
  timezone: string;
  reviews: ReviewWithContext[];
}) {
  const now = DateTime.now().setZone(input.timezone);
  const serviceMap = new Map(input.services.map((service) => [service.id, service]));

  // Отзывы по клиенту: те же данные, что в ленте, просто разложенные по людям.
  const reviewsByClient = new Map<string, ReviewWithContext[]>();

  for (const review of input.reviews) {
    if (!review.clientId) {
      continue;
    }

    const current = reviewsByClient.get(review.clientId) ?? [];
    current.push(review);
    reviewsByClient.set(review.clientId, current);
  }

  const items = input.clients.map((client) => {
    const clientBookings = input.bookings
      .filter((booking) => booking.clientId === client.id)
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt));

    const confirmedBookings = clientBookings.filter((booking) => booking.status === "confirmed");
    const pastConfirmedBookings = confirmedBookings.filter(
      (booking) =>
        DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(input.timezone).toMillis() <=
        now.toMillis(),
    );
    const upcomingConfirmedBookings = confirmedBookings
      .filter(
        (booking) =>
          DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(input.timezone).toMillis() >
          now.toMillis(),
      )
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

    const lastVisit = pastConfirmedBookings[0] ?? confirmedBookings[0] ?? clientBookings[0] ?? null;
    const nextVisit = upcomingConfirmedBookings[0] ?? null;

    const preferredServices = Array.from(
      confirmedBookings.reduce((map, booking) => {
        const service = serviceMap.get(booking.serviceId);
        if (!service) {
          return map;
        }

        const current = map.get(service.id) ?? {
          title: service.title,
          count: 0,
        };

        current.count += 1;
        map.set(service.id, current);
        return map;
      }, new Map<string, { title: string; count: number }>()),
    )
      .map(([, service]) => service)
      .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
      .slice(0, 3)
      .map((service) => ({
        title: service.title,
        visitsLabel: formatVisitCountLabel(service.count),
      }));

    const history: ClientDirectoryHistoryItem[] = clientBookings.slice(0, 5).map((booking) => {
      const service = serviceMap.get(booking.serviceId);
      const startsAtLabel = formatVisitMoment(booking.startsAt, input.timezone);
      const isUpcoming =
        booking.status === "confirmed" &&
        DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(input.timezone).toMillis() >
          now.toMillis();

      return {
        id: booking.id,
        serviceTitle: service?.title ?? "Услуга",
        startsAtLabel,
        statusLabel:
          booking.status === "cancelled_by_client"
            ? "Отменил клиент"
            : booking.status === "cancelled_by_master"
              ? "Отменено мастером"
              : isUpcoming
                ? "Предстоит"
                : "Состоялся",
        statusTone:
          booking.status === "cancelled_by_client"
            ? "warning"
            : booking.status === "cancelled_by_master"
              ? "neutral"
              : isUpcoming
                ? "accent"
                : "success",
        note: booking.clientNote,
      };
    });

    const searchText = [
      client.name,
      client.phoneMasked,
      client.notes,
      ...preferredServices.map((service) => service.title),
      ...history.map((visit) => visit.serviceTitle),
    ]
      .join(" ")
      .toLowerCase();

    // Рейтинг надёжности (Модуль 1, okno-tz-rating-prepayment.md) — считается
    // приватно, только по bookings этого мастера, из visit_status визитов
    // этого клиента.
    const reliability = buildReliabilityBadge(
      computeReliabilityAggregate(clientBookings.map((booking) => booking.visitStatus)),
    );

    return {
      id: client.id,
      name: client.name,
      phoneMasked: client.phoneMasked,
      notes: client.notes,
      lastVisitLabel: lastVisit
        ? formatVisitMoment(lastVisit.startsAt, input.timezone)
        : "Пока еще не было",
      nextVisitLabel: nextVisit
        ? formatVisitMoment(nextVisit.startsAt, input.timezone)
        : null,
      returnFrequencyLabel: formatReturnFrequency(pastConfirmedBookings, input.timezone),
      totalVisitsLabel: formatVisitCountLabel(confirmedBookings.length),
      preferredServices,
      history,
      reviews: (reviewsByClient.get(client.id) ?? []).map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        serviceTitle: review.serviceTitle,
        dateLabel: DateTime.fromISO(review.createdAtIso, { zone: "utc" })
          .setZone(input.timezone)
          .setLocale("ru")
          .toFormat("d LLLL yyyy"),
      })),
      searchText,
      reliability,
    } satisfies ClientDirectoryItem;
  });

  return items.sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

export default async function ClientsPage() {
  const data = await getClientsData();

  if (!data) {
    redirect("/login");
  }

  const { bookings, clients, profile, services } = data;
  const reviews = await getReviewsForProfile({ profileId: profile.id });
  const summary = summarizeReviews(reviews);
  const clientItems = buildClientDirectoryItems({
    clients,
    bookings,
    services,
    timezone: profile.timezone,
    reviews,
  });

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge tone="accent">Клиенты</Badge>
          <h1 className="text-4xl font-semibold text-ink">Клиенты и история визитов</h1>
        </div>
        <ButtonLink href="/reviews" variant="secondary" className="gap-2">
          <Star size={16} />
          {summary.count > 0 ? `Отзывы · ${summary.average}` : "Отзывы"}
        </ButtonLink>
      </div>

      <Card className="space-y-5">
        <ClientDirectory
          items={clientItems}
          showReliability={hasCapability(profile, "clientReliability")}
        />
      </Card>

      {clients.length === 0 ? (
        <EmptyState
          title="Новых клиентов пока нет"
          description="После первой реальной записи клиент появится здесь автоматически вместе с историей и заметками."
          ctaLabel="Открыть свою ссылку"
          ctaHref={`/${profile.username}`}
        />
      ) : null}
    </div>
  );
}
