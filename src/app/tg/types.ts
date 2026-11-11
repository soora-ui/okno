import type { ClientCertificate } from "@/app/tg/certificates";

// Форма ответа /api/telegram/miniapp/bookings — то, из чего собраны вкладки.

export type MiniAppBooking = {
  bookingId: string;
  masterName: string;
  masterUsername: string;
  masterUrl: string;
  serviceTitle: string;
  startsAtIso: string;
  startsAtLabel: string;
  dayLabel: string;
  weekdayLabel: string;
  timeLabel: string;
  relativeLabel: string;
  cancelUrl: string | null;
  repeatUrl: string;
  consultantAvailable: boolean;
  consultantToken: string | null;
  masterAvatarUrl: string | null;
  masterSpecialty: string;
  city: string;
  address: string;
  routeUrl: string | null;
};

export type PendingPaymentBooking = MiniAppBooking & {
  amountRub: number;
  confirmationUrl: string;
};

export type MyMaster = {
  username: string;
  name: string;
  specialty: string;
  avatarUrl: string | null;
  url: string;
  lastServiceTitle: string;
  repeatUrl: string;
  visits: number;
};

export type MiniAppReview = { bookingId: string; rating: number; comment: string };

export type MiniAppData = {
  firstName: string | null;
  hasIdentity: boolean;
  // Чат привязан к кабинету мастера — показываем вход в кабинет.
  master: { name: string; username: string } | null;
  bookings: MiniAppBooking[];
  past: MiniAppBooking[];
  myMasters: MyMaster[];
  pendingPayment: PendingPaymentBooking[];
  certificates: ClientCertificate[];
  reviews: MiniAppReview[];
};

export type CatalogMasterCard = {
  profileId: string;
  username: string;
  name: string;
  specialty: string;
  city: string;
  address: string;
  avatarUrl: string | null;
  url: string;
  priceFrom: number | null;
  topServices: string[];
  rating: { average: number; count: number } | null;
};

export type CatalogCity = { name: string; count: number };

export type TabId = "home" | "search" | "visits" | "profile";
