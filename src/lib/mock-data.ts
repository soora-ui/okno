import type { PortfolioWork } from "@/lib/profile-media";
import {
  defaultBookingPageSettings,
  type BookingPageSettings,
} from "@/lib/booking-page-settings";
import {
  defaultBookingThemePresetId,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";
import type { AccountRole, AccountStatus, WorkspaceKind } from "@/lib/workspace";
import type { PlanId } from "@/config/plans";
import {
  noServiceDiscounts,
  type HotWindowsDiscount,
  type ServiceDiscountSettings,
} from "@/lib/service-discounts";

// В базе subscription_tier хранит либо идентификатор тарифа, либо "free" —
// «оплаченного тарифа нет» (мастер в пробном периоде или после его окончания).
// Значение "pro" осталось от единственной старой подписки, см. src/lib/subscription.ts.
export type SubscriptionTier = "free" | "pro" | PlanId;

export type Profile = {
  id: string;
  email: string;
  passwordAuthId: string;
  fullName: string;
  username: string;
  specialty: string;
  bio: string;
  locationText: string;
  timezone: string;
  address: string;
  telegramChatId: string | null;
  avatarUrl: string;
  avatarPath: string | null;
  portfolioWorks: PortfolioWork[];
  bookingThemePresetId: BookingThemePresetId;
  bookingPageSettings: BookingPageSettings;
  subscriptionTier: SubscriptionTier;
  subscriptionUntil: string | null;
  subscriptionPausedUntil: string | null;
  monthlyBookingLimit: number;
  monthlyBookingsUsed: number;
  bookingWindowDays: number;
  slotIntervalMinutes: number;
  cancellationNoticeHours: number;
  clientReminderHours: number;
  masterReminderHours: number;
  lateCancelThresholdHours: number;
  joinedAt: string;
  workspaceId: string;
  workspaceName: string;
  workspaceKind: WorkspaceKind;
  accountRole: AccountRole;
  accountStatus: AccountStatus;
  createdByProfileId: string | null;
  referralCode: string | null;
  referredBy: string | null;
  // Скидка на горящие окошки, включённая из окна сторис; null — нет.
  hotWindowsDiscount?: HotWindowsDiscount | null;
};

export type PrepaymentType = "none" | "fixed" | "percent";

export type Service = {
  id: string;
  profileId: string;
  title: string;
  description: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
  // Через сколько дней после визита услугу можно повторить. Мастер настраивает
  // это per-услуге; null — срок не задан.
  //
  // Единственный источник срока повторного визита в сервисе. На нём стоят и
  // SMS-напоминание, и предложение записаться повторно, которое делает
  // AI-консультант, — чтобы клиент не получил от сервиса две разные даты.
  repeatIntervalDays: number | null;
  // Перерыв после визита на эту услугу, минут: после одной услуги нужно
  // время на уборку и отдых, после другой — нет. Раньше был один на мастера.
  bufferMinutes: number;
  prepaymentType: PrepaymentType;
  prepaymentValue: number;
} & ServiceDiscountSettings;

export type ServiceManual = {
  id: string;
  serviceId: string;
  profileId: string;
  content: string;
  version: number;
  isActive: boolean;
  confirmedByMasterAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingStatus =
  | "confirmed"
  | "cancelled_by_client"
  | "cancelled_by_master"
  | "pending_payment";

export type VisitStatus =
  | "pending"
  | "completed"
  | "no_show"
  | "cancelled_late"
  | "cancelled_ok";

export type Client = {
  id: string;
  profileId: string;
  name: string;
  phoneMasked: string;
  notes: string;
  createdAt: string;
  lastBookingAt: string;
};

export type Booking = {
  id: string;
  profileId: string;
  clientId: string;
  serviceId: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  // Конец визита плюс перерыв его услуги — до этого момента время занято.
  // Хранится в записи, а не пересчитывается: смена перерыва в услуге не
  // должна задним числом двигать уже сделанные записи.
  busyUntil: string;
  source: "public_page" | "manual";
  clientNote: string;
  cancellationToken: string;
  cancellationTokenExpiresAt: string;
  createdAt: string;
  cancelledAt: string | null;
  visitStatus: VisitStatus;
  visitStatusSetAt: string | null;
  prepaymentRequired: boolean;
  // Цена услуги на момент записи (снимок, bookings.price). Нет — у записи из
  // моков или из запроса без этой колонки; тогда берётся текущая цена услуги.
  price?: number | null;
};

export type AvailabilityRule = {
  id: string;
  profileId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type BlockedSlot = {
  id: string;
  profileId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
};

export type NotificationEvent = {
  id: string;
  profileId: string;
  type:
    | "sms_confirmation"
    | "telegram_new_booking"
    | "sms_reminder_client"
    | "telegram_reminder_master"
    | "sms_repeat_visit_reminder";
  status: "sent" | "queued" | "failed" | "processing" | "cancelled";
  target: string;
  createdAt: string;
};

export type BookingSlot = {
  date: string;
  value: string;
  times: string[];
};

export const profile: Profile = {
  id: "master-1",
  email: "hello@okno.business",
  passwordAuthId: "auth-1",
  fullName: "Алина Мороз",
  username: "alina-nails",
  specialty: "Маникюр и брови",
  bio: "Кабинет у метро, работаю по записи с интервалом 30 минут между визитами, чтобы не торопить и не задерживать.",
  locationText: "Симферополь",
  timezone: "Europe/Simferopol",
  address: "ул. Пушкина, 12, кабинет 3",
  telegramChatId: "@okno_master_bot",
  avatarUrl: "/demo/avatar.svg",
  avatarPath: null,
  portfolioWorks: [
    {
      id: "portfolio-1",
      imageUrl: "/demo/work-1.svg",
      path: null,
    },
    {
      id: "portfolio-2",
      imageUrl: "/demo/work-2.svg",
      path: null,
    },
    {
      id: "portfolio-3",
      imageUrl: "/demo/work-3.svg",
      path: null,
    },
    {
      id: "portfolio-4",
      imageUrl: "/demo/work-4.svg",
      path: null,
    },
  ],
  bookingThemePresetId: defaultBookingThemePresetId,
  bookingPageSettings: defaultBookingPageSettings,
  subscriptionTier: "free",
  subscriptionUntil: null,
  subscriptionPausedUntil: null,
  monthlyBookingLimit: 50,
  monthlyBookingsUsed: 47,
  bookingWindowDays: 30,
  slotIntervalMinutes: 30,
  cancellationNoticeHours: 2,
  clientReminderHours: 24,
  masterReminderHours: 2,
  lateCancelThresholdHours: 24,
  joinedAt: "2026-03-01T10:00:00.000Z",
  workspaceId: "workspace-1",
  workspaceName: "Алина Мороз",
  workspaceKind: "solo",
  accountRole: "solo",
  accountStatus: "active",
  createdByProfileId: null,
  referralCode: "ALINA7X",
  referredBy: null,
};

export const services: Service[] = [
  {
    id: "svc-1",
    profileId: profile.id,
    title: "Маникюр с покрытием",
    description: "Включает снятие старого покрытия и однотонный цвет, без дизайна.",
    durationMinutes: 120,
    price: 1900,
    isActive: true,
    sortOrder: 1,
    repeatIntervalDays: 21,
    bufferMinutes: 15,
    prepaymentType: "none",
    prepaymentValue: 0,
    ...noServiceDiscounts,
  },
  {
    id: "svc-2",
    profileId: profile.id,
    title: "Коррекция бровей",
    description: "Форма, уход и легкая укладка без окрашивания.",
    durationMinutes: 45,
    price: 900,
    isActive: true,
    sortOrder: 2,
    repeatIntervalDays: 28,
    bufferMinutes: 10,
    prepaymentType: "none",
    prepaymentValue: 0,
    ...noServiceDiscounts,
  },
];

export const clients: Client[] = [
  {
    id: "client-1",
    profileId: profile.id,
    name: "Дарья Шевцова",
    phoneMasked: "+7 978 ***-**-14",
    notes: "Любит утренние слоты, чувствительная кожа.",
    createdAt: "2026-03-02T08:30:00.000Z",
    lastBookingAt: "2026-04-03T08:30:00.000Z",
  },
  {
    id: "client-2",
    profileId: profile.id,
    name: "Марина Костенко",
    phoneMasked: "+7 978 ***-**-57",
    notes: "Просит заранее напоминать о визите.",
    createdAt: "2026-03-15T12:00:00.000Z",
    lastBookingAt: "2026-04-03T12:00:00.000Z",
  },
];

export const bookings: Booking[] = [
  {
    id: "booking-1",
    profileId: profile.id,
    clientId: "client-1",
    serviceId: "svc-1",
    status: "confirmed",
    startsAt: "2026-04-03T08:30:00.000Z",
    endsAt: "2026-04-03T10:30:00.000Z",
    busyUntil: "2026-04-03T10:45:00.000Z",
    source: "public_page",
    clientNote: "Если можно, приду на 10 минут позже.",
    cancellationToken: "cancel_1",
    cancellationTokenExpiresAt: "2026-04-03T06:30:00.000Z",
    createdAt: "2026-04-02T14:10:00.000Z",
    cancelledAt: null,
    visitStatus: "pending",
    visitStatusSetAt: null,
    prepaymentRequired: false,
  },
  {
    id: "booking-2",
    profileId: profile.id,
    clientId: "client-2",
    serviceId: "svc-2",
    status: "confirmed",
    startsAt: "2026-04-03T12:00:00.000Z",
    endsAt: "2026-04-03T12:45:00.000Z",
    busyUntil: "2026-04-03T12:55:00.000Z",
    source: "public_page",
    clientNote: "У меня аллергия на один состав, расскажу на месте.",
    cancellationToken: "cancel_2",
    cancellationTokenExpiresAt: "2026-04-03T10:00:00.000Z",
    createdAt: "2026-04-02T15:15:00.000Z",
    cancelledAt: null,
    visitStatus: "pending",
    visitStatusSetAt: null,
    prepaymentRequired: false,
  },
];

export const availabilityRules: AvailabilityRule[] = [
  { id: "av-1", profileId: profile.id, weekday: 1, startTime: "09:00", endTime: "18:00", isActive: true },
  { id: "av-2", profileId: profile.id, weekday: 2, startTime: "09:00", endTime: "18:00", isActive: true },
  { id: "av-3", profileId: profile.id, weekday: 3, startTime: "09:00", endTime: "18:00", isActive: true },
  { id: "av-4", profileId: profile.id, weekday: 4, startTime: "10:00", endTime: "19:00", isActive: true },
  { id: "av-5", profileId: profile.id, weekday: 5, startTime: "10:00", endTime: "16:00", isActive: true },
];

export const blockedSlots: BlockedSlot[] = [
  {
    id: "block-1",
    profileId: profile.id,
    startsAt: "2026-04-04T10:00:00.000Z",
    endsAt: "2026-04-04T11:00:00.000Z",
    reason: "Перерыв на закупку",
  },
];

export const notificationEvents: NotificationEvent[] = [
  {
    id: "notification-1",
    profileId: profile.id,
    type: "sms_confirmation",
    status: "sent",
    target: "+7 978 ***-**-14",
    createdAt: "2026-04-02T14:11:00.000Z",
  },
  {
    id: "notification-2",
    profileId: profile.id,
    type: "telegram_new_booking",
    status: "sent",
    target: "@okno_master_bot",
    createdAt: "2026-04-02T14:11:00.000Z",
  },
];

export const bookingSlots: BookingSlot[] = [
  { date: "4 апреля", value: "2026-04-04", times: ["09:00", "11:30", "13:00", "15:30"] },
  { date: "5 апреля", value: "2026-04-05", times: ["10:00", "12:00", "14:30", "17:00"] },
  { date: "6 апреля", value: "2026-04-06", times: ["09:30", "11:00", "13:30", "16:00"] },
];

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);

export const getServiceById = (serviceId: string) =>
  services.find((service) => service.id === serviceId);

export const getClientById = (clientId: string) =>
  clients.find((client) => client.id === clientId);
