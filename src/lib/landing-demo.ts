import type { BookingSlot, Profile, Service } from "@/lib/mock-data";
import { defaultBookingThemePresetId } from "@/lib/booking-theme-presets";
import { defaultBookingPageSettings } from "@/lib/booking-page-settings";

export const landingDemoPublicPageHref = "/demo/public-page";
export const landingDemoBookHref = "/demo/public-page/book";

export const landingDemoProfile: Profile = {
  id: "landing-demo-master",
  email: "demo@okno.app",
  passwordAuthId: "landing-demo-auth",
  fullName: "Алина Мороз",
  username: "landing-demo",
  specialty: "Маникюр и брови",
  bio: "Спокойный кабинет у метро, мягкий сервис и аккуратные записи без спешки.",
  locationText: "Симферополь",
  timezone: "Europe/Simferopol",
  telegramChatId: null,
  avatarUrl: "/demo/avatar.svg",
  avatarPath: null,
  portfolioWorks: [
    {
      id: "landing-work-1",
      imageUrl: "/demo/work-1.svg",
      path: null,
    },
    {
      id: "landing-work-2",
      imageUrl: "/demo/work-2.svg",
      path: null,
    },
    {
      id: "landing-work-3",
      imageUrl: "/demo/work-3.svg",
      path: null,
    },
  ],
  bookingThemePresetId: defaultBookingThemePresetId,
  bookingPageSettings: {
    ...defaultBookingPageSettings,
    headline: "Аккуратный маникюр без спешки и потока",
    subheadline: "Спокойный кабинет у метро, запись без переписок и долгого ожидания",
  },
  subscriptionTier: "free",
  monthlyBookingLimit: 50,
  monthlyBookingsUsed: 32,
  bookingWindowDays: 30,
  slotIntervalMinutes: 30,
  bufferMinutes: 15,
  cancellationNoticeHours: 2,
  clientReminderHours: 24,
  masterReminderHours: 2,
  joinedAt: "2026-03-01T10:00:00.000Z",
  workspaceId: "landing-demo-workspace",
  workspaceName: "Алина Мороз",
  workspaceKind: "solo",
  accountRole: "solo",
  accountStatus: "active",
  createdByProfileId: null,
};

export const landingDemoServices: Service[] = [
  {
    id: "landing-svc-1",
    profileId: landingDemoProfile.id,
    title: "Накладки soft gel",
    description: "Длинные аккуратные накладки с мягкой формой и спокойным покрытием.",
    durationMinutes: 150,
    price: 2400,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "landing-svc-2",
    profileId: landingDemoProfile.id,
    title: "Экспресс-маникюр",
    description: "Быстрый визит без перегруза: форма, уход и аккуратное покрытие.",
    durationMinutes: 70,
    price: 1300,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: "landing-svc-3",
    profileId: landingDemoProfile.id,
    title: "Снятие + уход",
    description: "Короткий технический визит, если нужно только снять покрытие и восстановить ногти.",
    durationMinutes: 40,
    price: 800,
    isActive: true,
    sortOrder: 3,
  },
];

const landingDemoSlots: BookingSlot[] = [
  { date: "14 апреля", value: "2026-04-14", times: ["10:00", "11:30", "14:00", "18:30"] },
  { date: "15 апреля", value: "2026-04-15", times: ["09:30", "12:30", "15:00", "17:30"] },
  { date: "16 апреля", value: "2026-04-16", times: ["10:30", "13:00", "16:00"] },
  { date: "17 апреля", value: "2026-04-17", times: ["11:00", "14:30", "18:00"] },
  { date: "18 апреля", value: "2026-04-18", times: ["10:00", "12:00", "15:30"] },
];

export const landingDemoBookingSlotsByService: Record<string, BookingSlot[]> =
  Object.fromEntries(
    landingDemoServices.map((service, index) => [
      service.id,
      landingDemoSlots.map((slot) => ({
        ...slot,
        times: slot.times.slice(index === 0 ? 0 : 1),
      })),
    ]),
  );
