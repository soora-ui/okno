import { DateTime } from "luxon";
import type { Profile } from "@/lib/mock-data";
import type { MappedNotificationEvent } from "@/lib/mappers/domain";
import { resolveSubscription } from "@/lib/subscription";

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
  const { profile, notificationEvents } = input;
  // Лимит записей отменён вместе с бесплатным тарифом: предупреждаем не об
  // остатке записей, а об окончании оплаченного периода или пробного месяца.
  const subscription = resolveSubscription(profile);
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
            : event.type === "sms_repeat_visit_reminder"
              ? "Напоминание о повторном визите"
              : "Подтверждение отправлено",
    description:
      event.type === "telegram_new_booking"
        ? "Появилась новая запись. Проверь кабинет и, если нужно, свяжись с клиентом."
        : event.type === "telegram_reminder_master"
          ? "Напоминание о визите доставлено мастеру в Telegram."
          : event.type === "sms_reminder_client"
            ? `Напоминание о визите отправлено клиенту на ${event.target}.`
            : event.type === "sms_repeat_visit_reminder"
              ? `Напоминание о повторном визите отправлено клиенту на ${event.target}.`
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

  const accessDaysLeft = subscription.activeUntil
    ? Math.max(
        0,
        Math.ceil(
          DateTime.fromISO(subscription.activeUntil).diff(
            DateTime.now(),
            "days",
          ).days,
        ),
      )
    : null;

  if (!subscription.isActive) {
    systemItems.push({
      id: "system-subscription",
      title: subscription.isTrial ? "Пробный период закончился" : "Тариф не подключён",
      description:
        "Клиенты не могут записаться, пока тариф не оплачен. Выбрать тариф можно в настройках.",
      href: "/settings?tab=account",
      tone: "accent",
      createdAt: stableSystemIso,
      createdAtLabel: "Сегодня",
    });
  } else if (accessDaysLeft !== null && accessDaysLeft <= 5) {
    systemItems.push({
      id: "system-subscription",
      title: subscription.isTrial
        ? "Пробный период скоро закончится"
        : "Тариф скоро закончится",
      description: subscription.isTrial
        ? `Бесплатный доступ действует ещё ${accessDaysLeft} дн. Дальше нужен тариф, иначе запись остановится.`
        : `Оплаченный период заканчивается через ${accessDaysLeft} дн. Автосписания нет — продли вручную.`,
      href: "/settings?tab=account",
      tone: "warning",
      createdAt: stableSystemIso,
      createdAtLabel: "Сегодня",
    });
  }

  return [...systemItems, ...eventItems].slice(0, 8);
}
