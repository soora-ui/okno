import { DateTime } from "luxon";
import type { BookingSlot, Profile, Service } from "@/lib/mock-data";
import { defaultBookingThemePresetId } from "@/lib/booking-theme-presets";
import { defaultBookingPageSettings } from "@/lib/booking-page-settings";

const landingDemoTimezone = "Europe/Simferopol";

export const landingDemoPublicPageHref = "/demo/public-page";
export const landingDemoBookHref = "/demo/public-page/book";

export const landingDemoProfile: Profile = {
  id: "landing-demo-master",
  email: "demo@okno.business",
  passwordAuthId: "landing-demo-auth",
  fullName: "Алина Мороз",
  username: "landing-demo",
  specialty: "Маникюр и брови",
  bio: "Кабинет у метро, работаю по записи с интервалом 30 минут между визитами, чтобы не торопить и не задерживать.",
  locationText: "Симферополь",
  timezone: "Europe/Simferopol",
  address: "ул. Пушкина, 12, кабинет 3",
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
    headline: "Маникюр и брови в кабинете у метро",
    subheadline: "Запись онлайн — без переписок и ожидания ответа",
  },
  subscriptionTier: "free",
  subscriptionUntil: null,
  monthlyBookingLimit: 50,
  monthlyBookingsUsed: 32,
  bookingWindowDays: 30,
  slotIntervalMinutes: 30,
  bufferMinutes: 15,
  cancellationNoticeHours: 2,
  clientReminderHours: 24,
  masterReminderHours: 2,
  lateCancelThresholdHours: 24,
  joinedAt: "2026-03-01T10:00:00.000Z",
  workspaceId: "landing-demo-workspace",
  workspaceName: "Алина Мороз",
  workspaceKind: "solo",
  accountRole: "solo",
  accountStatus: "active",
  createdByProfileId: null,
  referralCode: "DEMO7X1",
  referredBy: null,
};

export const landingDemoServices: Service[] = [
  {
    id: "landing-svc-1",
    profileId: landingDemoProfile.id,
    title: "Накладки soft gel",
    description: "Длина и форма на выбор, покрытие гель-лаком в один тон или с деликатным дизайном.",
    durationMinutes: 150,
    price: 2400,
    isActive: true,
    sortOrder: 1,
    repeatIntervalDays: 21,
    prepaymentType: "none",
    prepaymentValue: 0,
  },
  {
    id: "landing-svc-2",
    profileId: landingDemoProfile.id,
    title: "Экспресс-маникюр",
    description: "Форма, уход за кутикулой и покрытие в один тон — визит на 70 минут.",
    durationMinutes: 70,
    price: 1300,
    isActive: true,
    sortOrder: 2,
    repeatIntervalDays: 14,
    prepaymentType: "none",
    prepaymentValue: 0,
  },
  {
    id: "landing-svc-3",
    profileId: landingDemoProfile.id,
    title: "Снятие + уход",
    description: "Снимаю старое покрытие, укрепляю ногти маслом и питательным кремом.",
    durationMinutes: 40,
    price: 800,
    isActive: true,
    sortOrder: 3,
    repeatIntervalDays: null,
    prepaymentType: "none",
    prepaymentValue: 0,
  },
];

// Слоты демо-страницы считаются от текущей даты: захардкоженные даты со временем
// протухают, и посетитель видит в «ближайших окнах» прошедшие дни.
const landingDemoSlotTimes = [
  ["10:00", "11:30", "14:00", "18:30"],
  ["09:30", "12:30", "15:00", "17:30"],
  ["10:30", "13:00", "16:00"],
  ["11:00", "14:30", "18:00"],
  ["10:00", "12:00", "15:30"],
];

const landingDemoSlots: BookingSlot[] = landingDemoSlotTimes.map((times, index) => {
  const day = DateTime.now().setZone(landingDemoTimezone).plus({ days: index + 1 });

  return {
    date: day.setLocale("ru").toFormat("d MMMM"),
    value: day.toISODate() ?? "",
    times,
  };
});

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
