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
import { canManageWorkspace, isTeamWorkspaceKind } from "@/lib/workspace";

export type OwnerFreeWindows =
  | { status: "ready"; days: FreeWindowDay[]; bookingUrl: string }
  // Публичная запись выключена: делиться ссылкой, по которой нельзя
  // записаться, бессмысленно.
  | { status: "booking-off" }
  | { status: "unavailable" };

// Админ студии своими окошками не делится — у его страницы нет своего
// расписания, это витрина команды. Он выбирает мастера (getTeamFreeWindows).
function isTeamAdmin(profile: Profile) {
  return canManageWorkspace(profile.accountRole) && isTeamWorkspaceKind(profile.workspaceKind);
}

// Окошки мастера для кабинета и картинки сторис. Берём публичную выдачу
// (getPublicPageData), а не данные кабинета: окошко должно совпадать с тем,
// что клиент увидит по ссылке. Сотрудник студии здесь — как соло-мастер:
// у него своя страница /имя со своим расписанием, а подписку кабинет уже
// подставил из тарифа студии (lib/workspace-payer.ts).
export async function getOwnerFreeWindows(input: {
  profile: Profile;
  source: "mock" | "supabase";
}): Promise<OwnerFreeWindows> {
  const { profile } = input;
  if (isTeamAdmin(profile) || !profile.username) {
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

export type TeamMemberFreeWindows = {
  // Профиль сотрудника в публичном виде (без почты и служебных полей):
  // имя, страница, тема и скидка на окошки — для карточки и сторис.
  profile: Profile;
  days: FreeWindowDay[];
  bookingUrl: string;
};

export type TeamFreeWindows =
  | { status: "ready"; members: TeamMemberFreeWindows[] }
  | { status: "booking-off" }
  | { status: "unavailable" };

// Окошки каждого мастера студии — для админа, который выбирает, чьими
// окошками поделиться. Источник тот же, что у страницы студии: её выдача уже
// посчитала слоты по каждому сотруднику. Мастера без активных услуг туда не
// попадают — записаться к ним всё равно нельзя.
export async function getTeamFreeWindows(actor: Profile): Promise<TeamFreeWindows> {
  if (!isTeamAdmin(actor) || !actor.username) return { status: "unavailable" };

  const subscription = resolveSubscription(actor);
  if (!subscription.isActive || subscription.pausedUntil) {
    return { status: "booking-off" };
  }

  try {
    const data = await getPublicPageData(actor.username, false);
    if (data.kind !== "team") return { status: "unavailable" };

    return {
      status: "ready",
      members: data.members.map((member) => ({
        profile: member.profile,
        days: buildFreeWindows({
          services: member.services,
          bookingSlotsByService: member.bookingSlotsByService,
          timezone: member.profile.timezone,
        }),
        bookingUrl: `${env.appUrl}/${member.profile.username}`,
      })),
    };
  } catch (error) {
    logError("Free windows: team slots failed", { profileId: actor.id, error });
    return { status: "unavailable" };
  }
}

export type FreeWindowsStoryTarget =
  | { status: "ready"; profile: Profile; days: FreeWindowDay[] }
  | { status: "not-found" };

// Чьи окошки рисовать в сторис. Без memberId — свои (мастер, сотрудник).
// С memberId — админ студии выбрал мастера: проверяем, что это его студия,
// иначе по чужому id можно было бы получить чужое расписание.
export async function resolveFreeWindowsStoryTarget(input: {
  profile: Profile;
  source: "mock" | "supabase";
  memberId: string | null;
}): Promise<FreeWindowsStoryTarget> {
  if (!input.memberId) {
    const own = await getOwnerFreeWindows(input);
    return own.status === "ready" && own.days.length > 0
      ? { status: "ready", profile: input.profile, days: own.days }
      : { status: "not-found" };
  }

  const team = await getTeamFreeWindows(input.profile);
  if (team.status !== "ready") return { status: "not-found" };
  const member = team.members.find((item) => item.profile.id === input.memberId);
  return member && member.days.length > 0
    ? { status: "ready", profile: member.profile, days: member.days }
    : { status: "not-found" };
}
