import { getDashboardData, getPublicPageData } from "@/lib/data";
import { env } from "@/lib/env";
import {
  buildFreeWindows,
  freeWindowsDaysAhead,
  type FreeWindowDay,
} from "@/lib/free-windows";
import type { Profile } from "@/lib/mock-data";
import { logError } from "@/lib/observability/logger";
import { buildBookingSlotsForService } from "@/lib/slots";
import { resolveSubscription } from "@/lib/subscription";
import { isTeamWorkspaceKind } from "@/lib/workspace";

export type OwnerFreeWindows =
  | { status: "ready"; days: FreeWindowDay[]; bookingUrl: string }
  // Публичная запись выключена: делиться ссылкой, по которой нельзя
  // записаться, бессмысленно.
  | { status: "booking-off" }
  | { status: "unavailable" };

// Окошки мастера для кабинета и картинки сторис. Берём публичную выдачу
// (getPublicPageData), а не данные кабинета: окошко должно совпадать с тем,
// что клиент увидит по ссылке.
export async function getOwnerFreeWindows(input: {
  profile: Profile;
  source: "mock" | "supabase";
}): Promise<OwnerFreeWindows> {
  const { profile } = input;
  // Студии — отдельный формат (несколько мастеров), в v1 не делаем.
  if (isTeamWorkspaceKind(profile.workspaceKind) || !profile.username) {
    return { status: "unavailable" };
  }

  const subscription = resolveSubscription(profile);
  if (!subscription.isActive || subscription.pausedUntil) {
    return { status: "booking-off" };
  }

  const bookingUrl = `${env.appUrl}/${profile.username}`;

  // Демо-кабинет и локальный режим без базы: публичной страницы такого мастера
  // в базе нет, считаем слоты из тех же мок-данных, что видит кабинет.
  if (input.source === "mock") {
    const data = await getDashboardData();
    if (data?.source !== "mock") return { status: "unavailable" };
    const bookingSlotsByService = Object.fromEntries(
      data.services.map((service) => [
        service.id,
        buildBookingSlotsForService({
          profile: data.profile,
          service,
          availabilityRules: data.availabilityRules,
          blockedSlots: data.blockedSlots,
          bookings: data.bookings,
          maxDaysToShow: freeWindowsDaysAhead,
        }),
      ]),
    );
    return {
      status: "ready",
      days: buildFreeWindows({
        services: data.services,
        bookingSlotsByService,
        timezone: data.profile.timezone,
      }),
      bookingUrl,
    };
  }

  try {
    const data = await getPublicPageData(profile.username, false);
    if (data.kind !== "solo") return { status: "unavailable" };

    return {
      status: "ready",
      days: buildFreeWindows({
        services: data.services,
        bookingSlotsByService: data.bookingSlotsByService,
        timezone: data.profile.timezone,
      }),
      bookingUrl,
    };
  } catch (error) {
    // Карточка второстепенная: без неё главная кабинета должна открываться.
    logError("Free windows: public slots failed", { profileId: profile.id, error });
    return { status: "unavailable" };
  }
}
