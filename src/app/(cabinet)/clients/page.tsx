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
import {
  buildReliabilityBadge,
  computeReliabilityAggregate,
  visitStatusLabels,
  type VisitStatus,
} from "@/lib/client-reliability";
import { assessClientReturn, formatDaysAgo } from "@/lib/client-return";
import { getClientsData } from "@/lib/data";
import { getReviewsForProfile, summarizeReviews, type ReviewWithContext } from "@/lib/reviews";
import { hasCapability } from "@/lib/subscription";
import {
  getClientReturnReachability,
  type ClientReturnReachability,
} from "@/lib/telegram/client-return-reminder";
import type { Booking, Client, Service } from "@/lib/mock-data";

// Отметки, после которых визит не считается состоявшимся: не идут в счётчик
// визитов, любимые услуги и частоту возврата — «не пришёл» это не визит.
const NOT_ATTENDED_VISIT_STATUSES = new Set<VisitStatus>([
  "no_show",
  "cancelled_late",
  "cancelled_ok",
]);

function isAttendedBooking(booking: Booking) {
  return booking.status === "confirmed" && !NOT_ATTENDED_VISIT_STATUSES.has(booking.visitStatus);
}

// Бейдж визита в истории карточки: отметка мастера (visit_status) главнее
// жизненного цикла записи — та же логика, что в архиве (booking-card.tsx).
function describeVisit(
  booking: Booking,
  isUpcoming: boolean,
): Pick<ClientDirectoryHistoryItem, "statusLabel" | "statusTone"> {
  if (booking.visitStatus !== "pending") {
    const tone: ClientDirectoryHistoryItem["statusTone"] =
      booking.visitStatus === "completed"
        ? "success"
        : booking.visitStatus === "cancelled_ok"
          ? "neutral"
          : booking.visitStatus === "cancelled_late"
            ? "warning"
            : "danger";

    return { statusLabel: visitStatusLabels[booking.visitStatus], statusTone: tone };
  }

  if (booking.status === "cancelled_by_client") {
    return { statusLabel: "Отменил клиент", statusTone: "warning" };
  }

  if (booking.status === "cancelled_by_master") {
    return { statusLabel: "Отменено мастером", statusTone: "neutral" };
  }

  if (isUpcoming) {
    return { statusLabel: "Предстоит", statusTone: "accent" };
  }

  return { statusLabel: "Состоялся", statusTone: "success" };
}

function formatVisitMoment(startsAt: string, timezone: string) {
  return DateTime.fromISO(startsAt, { zone: "utc" })
    .setZone(timezone)
    .setLocale("ru")
    .toFormat("d MMMM, HH:mm");
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
  reachability: Map<string, ClientReturnReachability>;
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

    const attendedBookings = clientBookings.filter(isAttendedBooking);
    const pastAttendedBookings = attendedBookings.filter(
      (booking) =>
        DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(input.timezone).toMillis() <=
        now.toMillis(),
    );
    const upcomingAttendedBookings = attendedBookings
      .filter(
        (booking) =>
          DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(input.timezone).toMillis() >
          now.toMillis(),
      )
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

    const lastVisit = pastAttendedBookings[0] ?? attendedBookings[0] ?? clientBookings[0] ?? null;
    const nextVisit = upcomingAttendedBookings[0] ?? null;

    const preferredServices = Array.from(
      attendedBookings.reduce((map, booking) => {
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
        ...describeVisit(booking, isUpcoming),
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

    // «Давно не был» — по сроку повтора услуги или собственной частоте
    // клиента (src/lib/client-return.ts). Несостоявшиеся визиты в расчёт не
    // идут (уже отфильтрованы в pastAttendedBookings): после «не пришёл»
    // напоминать «после маникюра» — мимо.
    const returnAssessment = assessClientReturn({
      pastVisits: pastAttendedBookings.map((booking) => ({
        startsAtIso: booking.startsAt,
        serviceId: booking.serviceId,
      })),
      hasUpcomingVisit: upcomingAttendedBookings.length > 0,
      services: input.services,
      timezone: input.timezone,
      now,
    });
    const reachability = input.reachability.get(client.id) ?? { chatId: null, lastSentAtIso: null };

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
      returnFrequencyLabel: formatReturnFrequency(pastAttendedBookings, input.timezone),
      totalVisitsLabel: formatVisitCountLabel(attendedBookings.length),
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
          .toFormat("d MMMM yyyy"),
      })),
      searchText,
      reliability,
      returnStatus: {
        due: returnAssessment.status === "due",
        sinceLabel:
          returnAssessment.daysSinceLastVisit !== null
            ? `${formatDaysAgo(returnAssessment.daysSinceLastVisit)} назад`
            : null,
      },
      telegram: {
        reachable: Boolean(reachability.chatId),
        lastRemindedLabel: reachability.lastSentAtIso
          ? DateTime.fromISO(reachability.lastSentAtIso, { zone: "utc" })
              .setZone(input.timezone)
              .setLocale("ru")
              .toFormat("d MMMM")
          : null,
      },
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
  // В демо базы нет: ни отзывов, ни того, кому напоминать.
  const isLive = data.source === "supabase";
  const [reviews, reachability] = await Promise.all([
    isLive ? getReviewsForProfile({ profileId: profile.id }) : Promise.resolve([]),
    isLive
      ? getClientReturnReachability({ profileId: profile.id })
      : Promise.resolve(new Map<string, ClientReturnReachability>()),
  ]);
  const summary = summarizeReviews(reviews);
  const clientItems = buildClientDirectoryItems({
    clients,
    bookings,
    services,
    timezone: profile.timezone,
    reviews,
    reachability,
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
