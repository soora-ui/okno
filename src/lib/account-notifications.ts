import { DateTime } from "luxon";
import type { Profile } from "@/lib/mock-data";
import type { MappedNotificationEvent } from "@/lib/mappers/domain";

export type AccountNotificationItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "neutral" | "success" | "accent" | "warning";
  createdAt: string;
  createdAtLabel: string;
};

function formatNotificationMoment(createdAt: string, timezone: string) {
  return DateTime.fromISO(createdAt, { zone: "utc" })
    .setZone(timezone)
    .setLocale("ru")
    .toFormat("d LLLL, HH:mm");
}

export function buildAccountNotificationItems(input: {
  profile: Profile;
  notificationEvents: MappedNotificationEvent[];
  monthlyBookingsUsed: number;
}) {
  const { profile, notificationEvents, monthlyBookingsUsed } = input;
  const remainingBookings = Math.max(
    0,
    profile.monthlyBookingLimit - monthlyBookingsUsed,
  );
  const stableSystemIso =
    DateTime.now()
      .setZone(profile.timezone)
      .startOf("day")
      .toUTC()
      .toISO() ?? new Date().toISOString();

  const eventItems: AccountNotificationItem[] = notificationEvents.map((event) => ({
    id: `event-${event.id}`,
    title:
      event.type === "telegram_new_booking"
        ? "Новая запись"
        : event.type === "telegram_reminder_master"
          ? "Напоминание мастеру"
          : event.type === "sms_reminder_client"
            ? "Напоминание клиенту"
            : event.type === "sms_certificate_code"
              ? "Сертификат отправлен"
              : "Подтверждение отправлено",
    description:
      event.type === "telegram_new_booking"
        ? "Появилась новая запись. Проверь кабинет и, если нужно, свяжись с клиентом."
        : event.type === "telegram_reminder_master"
          ? "Напоминание о визите доставлено мастеру в Telegram."
          : event.type === "sms_reminder_client"
            ? `Напоминание о визите отправлено клиенту на ${event.target}.`
            : event.type === "sms_certificate_code"
              ? `Код подарочного сертификата отправлен на ${event.target}.`
              : `Подтверждение по записи отправлено на ${event.target}.`,
    href:
      event.type === "telegram_new_booking" || event.type === "telegram_reminder_master"
        ? "/dashboard#today-bookings"
        : "/clients",
    tone:
      event.type === "telegram_new_booking"
        ? "accent"
        : event.type === "telegram_reminder_master"
          ? "success"
          : "neutral",
    createdAt: event.createdAt,
    createdAtLabel: formatNotificationMoment(event.createdAt, profile.timezone),
  }));

  const systemItems: AccountNotificationItem[] = [];

  if (!profile.telegramChatId) {
    systemItems.push({
      id: "system-telegram",
      title: "Подключи Telegram",
      description:
        "Так быстрее увидишь новые записи и уведомления кабинета.",
      href: "/settings",
      tone: "warning",
      createdAt: stableSystemIso,
      createdAtLabel: "Сегодня",
    });
  }

  if (remainingBookings <= 10) {
    systemItems.push({
      id: "system-limit",
      title:
        remainingBookings > 0 ? "Лимит скоро закончится" : "Лимит закончился",
      description:
        remainingBookings > 0
          ? `Осталось ${remainingBookings} записей в этом месяце. Посмотри тариф Pro, если нужно больше.`
          : "Бесплатный лимит записей на этот месяц исчерпан. Перейди на Pro, чтобы продолжить.",
      href: "/pricing",
      tone: remainingBookings > 0 ? "warning" : "accent",
      createdAt: stableSystemIso,
      createdAtLabel: "Сегодня",
    });
  }

  return [...systemItems, ...eventItems].slice(0, 8);
}
