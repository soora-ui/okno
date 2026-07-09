import { cache } from "react";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import {
  availabilityRules,
  blockedSlots,
  bookingSlots,
  bookings,
  clients,
  notificationEvents,
  pricingPlans,
  profile as mockProfile,
  type Profile,
  services as mockServices,
} from "@/lib/mock-data";
import {
  humanizeBookingDate,
  isCancellationAllowed,
} from "@/lib/booking";
import { buildAccountNotificationItems } from "@/lib/account-notifications";
import { normalizeBookingThemePresetId } from "@/lib/booking-theme-presets";
import { ensureWorkRuntime, isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { getMockBookingConfirmation } from "@/lib/mock-booking-confirmations";
import {
  mapAvailabilityRule,
  mapBlockedSlot,
  mapBooking,
  mapClient,
  mapNotificationEvent,
  mapProfile,
  mergeProfileMedia,
  mapService,
  mapServiceManual,
} from "@/lib/mappers/domain";
import type { ServiceManualSummary } from "@/lib/service-manuals";
import {
  getOwnerClientsRows,
  getOwnerDashboardRows,
  getOwnerNotificationRows,
  getOwnerProfileMediaRow,
  getOwnerProfileRow,
  getOwnerReferralRows,
  getOwnerScheduleRows,
  getOwnerServiceManualRows,
  getOwnerSettingsRows,
} from "@/lib/repositories/owner-repository";
import type { ReferralInviteSummary } from "@/lib/referral";
import { getWorkspaceTeamRows } from "@/lib/repositories/team-repository";
import { buildBookingSlotsForService } from "@/lib/slots";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isRetryableSupabaseNetworkError,
  isSupabaseMissingColumnError,
} from "@/lib/supabase/auth-errors";
import {
  canManageWorkspace,
  getAccountStatusLabel,
  getAccountRoleLabel,
  getWorkspaceKindLabel,
  isAccountActive,
  isTeamWorkspaceKind,
  normalizeAccountStatus,
  type AccountRole,
  type AccountStatus,
  type WorkspaceKind,
} from "@/lib/workspace";

export type TeamWorkspaceSummary = {
  id: string;
  name: string;
  kind: WorkspaceKind;
  kindLabel: string;
  memberCount: number;
  activeMemberCount: number;
  disabledMemberCount: number;
  staffCount: number;
  bookingsTodayCount: number;
  upcomingBookingsCount: number;
  clientCount: number;
};

export type TeamMemberSummary = {
  id: string;
  fullName: string;
  specialty: string;
  username: string;
  email: string;
  locationText: string;
  timezone: string;
  accountRole: AccountRole;
  roleLabel: string;
  accountStatus: AccountStatus;
  statusLabel: string;
  clientCount: number;
  activeServicesCount: number;
  upcomingBookingsCount: number;
  nextBookingLabel: string | null;
  joinedAtLabel: string;
};

export type TeamUpcomingBookingItem = {
  id: string;
  memberName: string;
  memberUsername: string;
  clientName: string;
  serviceTitle: string;
  startsAtLabel: string;
  sourceLabel: string;
};

export type TeamRecentClientItem = {
  id: string;
  name: string;
  phoneMasked: string;
  memberName: string;
  memberUsername: string;
  lastVisitLabel: string;
  notes: string;
};

export type TeamDashboardData = {
  profile: Profile;
  workspace: TeamWorkspaceSummary;
  members: TeamMemberSummary[];
  upcomingBookings: TeamUpcomingBookingItem[];
  recentClients: TeamRecentClientItem[];
  source: "supabase";
};

export type PublicTeamMember = {
  profile: Profile;
  services: ReturnType<typeof mapService>[];
  bookingSlotsByService: Record<string, typeof bookingSlots>;
};

export type PublicPageData =
  | {
      kind: "solo";
      profile: Profile;
      services: ReturnType<typeof mapService>[];
      bookingSlotsByService: Record<string, typeof bookingSlots>;
      source: "mock" | "supabase";
    }
  | {
      kind: "team";
      profile: Profile;
      members: PublicTeamMember[];
      source: "supabase";
    };

function formatTeamMoment(createdAt: string, timezone: string) {
  return DateTime.fromISO(createdAt, { zone: "utc" })
    .setZone(timezone)
    .setLocale("ru")
    .toFormat("d LLLL, HH:mm");
}

function formatTeamJoinDate(createdAt: string, timezone: string) {
  return DateTime.fromISO(createdAt, { zone: "utc" })
    .setZone(timezone)
    .setLocale("ru")
    .toFormat("d LLLL yyyy");
}

function asRecords(data: unknown[] | null) {
  return (data ?? []) as Record<string, unknown>[];
}

const PUBLIC_PROFILE_BASE_COLUMNS = [
  "id",
  "email",
  "password_auth_id",
  "full_name",
  "username",
  "specialty",
  "bio",
  "location_text",
  "timezone",
  "address",
  "telegram_chat_id",
  "booking_theme_preset",
  "booking_page_settings",
  "subscription_tier",
  "monthly_booking_limit",
  "booking_window_days",
  "slot_interval_minutes",
  "buffer_minutes",
  "cancellation_notice_hours",
  "client_reminder_hours",
  "master_reminder_hours",
  "created_at",
  "workspace_id",
  "workspace_name",
  "workspace_kind",
  "account_role",
  "account_status",
  "created_by_profile_id",
].join(",");

const PUBLIC_PROFILE_WITH_MEDIA_COLUMNS = [
  PUBLIC_PROFILE_BASE_COLUMNS,
  "avatar_url",
  "portfolio_works",
].join(",");

const PUBLIC_SERVICE_COLUMNS = [
  "id",
  "profile_id",
  "title",
  "description",
  "duration_minutes",
  "price",
  "is_active",
  "sort_order",
].join(",");

const PUBLIC_AVAILABILITY_RULE_COLUMNS = [
  "id",
  "profile_id",
  "weekday",
  "start_time",
  "end_time",
  "is_active",
].join(",");

const PUBLIC_BLOCKED_SLOT_COLUMNS = [
  "id",
  "profile_id",
  "starts_at",
  "ends_at",
  "reason",
].join(",");

const PUBLIC_BOOKING_COLUMNS = [
  "id",
  "profile_id",
  "client_id",
  "service_id",
  "status",
  "starts_at",
  "ends_at",
  "source",
  "client_note",
  "cancellation_token",
  "cancellation_token_expires_at",
  "created_at",
  "cancelled_at",
].join(",");


export const getPublicPageData = cache(async function getPublicPageData(
  username: string,
  includeMedia = true,
): Promise<PublicPageData> {
  if (!isSupabaseConfigured) {
    ensureWorkRuntime("публичная страница мастера");
    if (username !== mockProfile.username) notFound();
    return {
      kind: "solo",
      profile: mockProfile,
      services: mockServices,
      bookingSlotsByService: Object.fromEntries(
        mockServices.map((service) => [service.id, bookingSlots]),
      ) as Record<string, typeof bookingSlots>,
      source: "mock" as const,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select(includeMedia ? PUBLIC_PROFILE_WITH_MEDIA_COLUMNS : PUBLIC_PROFILE_BASE_COLUMNS)
    .eq("username", username)
    .maybeSingle();

  let resolvedProfileRow = profileRow;

  if (profileError) {
    if (isRetryableSupabaseNetworkError(profileError)) {
      throw new Error(
        "Нет связи с публичной страницей мастера. Проверь Supabase и попробуй еще раз.",
      );
    }

    // Колонка ещё не добавлена миграцией — перечитываем профиль целиком,
    // чтобы публичная страница не падала из-за нового опционального поля.
    if (isSupabaseMissingColumnError(profileError)) {
      const fallback = await admin
        .from("profiles")
        .select("*")
        .eq("username", username)
        .maybeSingle();

      if (fallback.error) {
        throw new Error("Не получилось загрузить профиль мастера.");
      }

      resolvedProfileRow = fallback.data;
    } else {
      throw new Error("Не получилось загрузить профиль мастера.");
    }
  }

  if (!resolvedProfileRow) notFound();
  const publicProfileRow = resolvedProfileRow as unknown as Record<string, unknown>;
  if (!isAccountActive(normalizeAccountStatus(publicProfileRow.account_status))) {
    notFound();
  }

  const mappedProfile = mapProfile(publicProfileRow);

  if (
    canManageWorkspace(mappedProfile.accountRole) &&
    isTeamWorkspaceKind(mappedProfile.workspaceKind)
  ) {
    const teamRows = await getWorkspaceTeamRows({
      workspaceId: mappedProfile.workspaceId,
    });
    const mappedMembers = teamRows.members
      .map((row) => mapProfile(row))
      .filter((member) => isAccountActive(member.accountStatus));
    const memberIds = mappedMembers.map((member) => member.id);

    if (memberIds.length === 0) {
      return {
        kind: "team",
        profile: mappedProfile,
        members: [],
        source: "supabase",
      };
    }

    const [availabilityResult, blockedResult] = await Promise.all([
      admin
        .from("availability_rules")
        .select(PUBLIC_AVAILABILITY_RULE_COLUMNS)
        .in("profile_id", memberIds)
        .order("weekday"),
      admin
        .from("blocked_slots")
        .select(PUBLIC_BLOCKED_SLOT_COLUMNS)
        .in("profile_id", memberIds)
        .order("starts_at"),
    ]);

    if (availabilityResult.error || blockedResult.error) {
      if (
        [availabilityResult.error, blockedResult.error].some((error) =>
          isRetryableSupabaseNetworkError(error),
        )
      ) {
        throw new Error(
          "Нет связи с публичной страницей команды. Проверь Supabase и попробуй еще раз.",
        );
      }

      throw new Error("Не получилось загрузить расписание команды.");
    }

    const services = teamRows.services
      .map((row) => mapService(row))
      .filter((service) => service.isActive);
    const bookings = teamRows.bookings
      .map((row) => mapBooking(row))
      .filter((booking) => booking.status === "confirmed");
    const availabilityRules = asRecords(availabilityResult.data).map((row) =>
      mapAvailabilityRule(row),
    );
    const blockedSlotsByMember = asRecords(blockedResult.data).map((row) =>
      mapBlockedSlot(row),
    );

    const members = mappedMembers
      .map((member) => {
        const memberServices = services
          .filter((service) => service.profileId === member.id)
          .sort((left, right) => left.sortOrder - right.sortOrder);

        return {
          profile: member,
          services: memberServices,
          bookingSlotsByService: Object.fromEntries(
            memberServices.map((service) => [
              service.id,
              buildBookingSlotsForService({
                profile: member,
                service,
                availabilityRules: availabilityRules.filter(
                  (rule) => rule.profileId === member.id,
                ),
                blockedSlots: blockedSlotsByMember.filter(
                  (slot) => slot.profileId === member.id,
                ),
                bookings: bookings.filter((booking) => booking.profileId === member.id),
              }),
            ]),
          ),
        };
      })
      .filter((member) => member.services.length > 0);

    return {
      kind: "team",
      profile: mappedProfile,
      members,
      source: "supabase",
    };
  }

  const [
    serviceResult,
    availabilityResult,
    blockedResult,
    bookingResult,
  ] = await Promise.all([
    admin
      .from("services")
      .select(PUBLIC_SERVICE_COLUMNS)
      .eq("profile_id", publicProfileRow.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("availability_rules")
      .select(PUBLIC_AVAILABILITY_RULE_COLUMNS)
      .eq("profile_id", publicProfileRow.id)
      .order("weekday"),
    admin
      .from("blocked_slots")
      .select(PUBLIC_BLOCKED_SLOT_COLUMNS)
      .eq("profile_id", publicProfileRow.id),
    admin
      .from("bookings")
      .select(PUBLIC_BOOKING_COLUMNS)
      .eq("profile_id", publicProfileRow.id)
      .eq("status", "confirmed")
      .order("starts_at"),
  ]);

  if (
    serviceResult.error ||
    availabilityResult.error ||
    blockedResult.error ||
    bookingResult.error
  ) {
    if (
      [
        serviceResult.error,
        availabilityResult.error,
        blockedResult.error,
        bookingResult.error,
      ].some((error) => isRetryableSupabaseNetworkError(error))
    ) {
      throw new Error(
        "Нет связи с публичной страницей мастера. Проверь Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить свободное время мастера.");
  }

  const mappedServices = asRecords(serviceResult.data).map((row) => mapService(row));
  const mappedAvailability = asRecords(availabilityResult.data).map((row) =>
    mapAvailabilityRule(row),
  );
  const mappedBlockedSlots = asRecords(blockedResult.data).map((row) =>
    mapBlockedSlot(row),
  );
  const mappedBookings = asRecords(bookingResult.data).map((row) => mapBooking(row));

  const bookingSlotsByService = Object.fromEntries(
    mappedServices.map((service) => [
      service.id,
      buildBookingSlotsForService({
        profile: mappedProfile,
        service,
        availabilityRules: mappedAvailability,
        blockedSlots: mappedBlockedSlots,
        bookings: mappedBookings,
      }),
    ]),
  );

  return {
    kind: "solo",
    profile: mappedProfile,
    services: mappedServices,
    bookingSlotsByService,
    source: "supabase" as const,
  };
});

export const getCurrentAuthProfile = cache(async function getCurrentAuthProfile() {
  if (!isSupabaseConfigured) {
    if (isDemoMode) {
      return { profile: mockProfile, source: "mock" as const };
    }

    return null;
  }

  const profileRow = await getOwnerProfileRow();

  if (!profileRow) return null;

  const mappedProfile = mapProfile(profileRow);
  if (!isAccountActive(mappedProfile.accountStatus)) {
    return null;
  }

  return {
    profile: mappedProfile,
    source: "supabase" as const,
  };
});

export async function getAccountNotificationPanelData(input: {
  profile: Profile;
  source: "mock" | "supabase";
}) {
  if (input.source === "mock") {
    return {
      storageKey: `okno.notifications.last-seen.${input.profile.id}`,
      items: buildAccountNotificationItems({
        profile: input.profile,
        notificationEvents,
        monthlyBookingsUsed: input.profile.monthlyBookingsUsed,
      }),
    };
  }

  const notificationData = await getOwnerNotificationRows({
    profileId: input.profile.id,
    timezone: input.profile.timezone,
  });

  return {
    storageKey: `okno.notifications.last-seen.${input.profile.id}`,
    items: buildAccountNotificationItems({
      profile: input.profile,
      notificationEvents: notificationData.notificationEvents.map((row) =>
        mapNotificationEvent(row),
      ),
      monthlyBookingsUsed: notificationData.monthlyBookingsUsed,
    }),
  };
}

export async function getDashboardData() {
  const authProfile = await getCurrentAuthProfile();

  if (!authProfile) {
    if (!isSupabaseConfigured && isDemoMode) {
      return {
        profile: mockProfile,
        services: mockServices,
        bookings,
        clients,
        availabilityRules,
        blockedSlots,
        notificationEvents,
        source: "mock" as const,
      };
    }

    return null;
  }

  if (authProfile.source === "mock") {
    return {
      profile: authProfile.profile,
      services: mockServices,
      bookings,
      clients,
      availabilityRules,
      blockedSlots,
      notificationEvents,
      source: "mock" as const,
    };
  }

  const dashboardData = await getOwnerDashboardRows({
    profileId: authProfile.profile.id,
    timezone: authProfile.profile.timezone,
  });

  return {
    profile: {
      ...authProfile.profile,
      monthlyBookingsUsed: dashboardData.monthlyBookingsUsed,
    },
    services: dashboardData.services.map((row) => mapService(row)),
    bookings: dashboardData.bookings.map((row) => mapBooking(row)),
    clients: dashboardData.clients.map((row) => mapClient(row)),
    source: "supabase" as const,
  };
}

export async function getScheduleData() {
  const authProfile = await getCurrentAuthProfile();

  if (!authProfile) {
    if (!isSupabaseConfigured && isDemoMode) {
      return {
        profile: mockProfile,
        bookings,
        availabilityRules,
        blockedSlots,
        source: "mock" as const,
      };
    }

    return null;
  }

  if (authProfile.source === "mock") {
    return {
      profile: authProfile.profile,
      bookings,
      availabilityRules,
      blockedSlots,
      source: "mock" as const,
    };
  }

  const scheduleData = await getOwnerScheduleRows({
    profileId: authProfile.profile.id,
  });

  return {
    profile: authProfile.profile,
    bookings: scheduleData.bookings.map((row) => mapBooking(row)),
    availabilityRules: scheduleData.availabilityRules.map((row) =>
      mapAvailabilityRule(row),
    ),
    blockedSlots: scheduleData.blockedSlots.map((row) => mapBlockedSlot(row)),
    source: "supabase" as const,
  };
}

export async function getClientsData() {
  const authProfile = await getCurrentAuthProfile();

  if (!authProfile) {
    if (!isSupabaseConfigured && isDemoMode) {
      return {
        profile: mockProfile,
        services: mockServices,
        bookings,
        clients,
        source: "mock" as const,
      };
    }

    return null;
  }

  if (authProfile.source === "mock") {
    return {
      profile: authProfile.profile,
      services: mockServices,
      bookings,
      clients,
      source: "mock" as const,
    };
  }

  const clientsData = await getOwnerClientsRows({
    profileId: authProfile.profile.id,
  });

  return {
    profile: authProfile.profile,
    services: clientsData.services.map((row) => mapService(row)),
    bookings: clientsData.bookings.map((row) => mapBooking(row)),
    clients: clientsData.clients.map((row) => mapClient(row)),
    source: "supabase" as const,
  };
}

function buildServiceManualSummaries(
  rows: Record<string, unknown>[],
  timezone: string,
): Record<string, ServiceManualSummary> {
  const summaries: Record<string, ServiceManualSummary> = {};

  for (const row of rows) {
    const manual = mapServiceManual(row);
    const confirmedAtLabel = manual.confirmedByMasterAt
      ? DateTime.fromISO(manual.confirmedByMasterAt)
          .setZone(timezone)
          .setLocale("ru")
          .toFormat("d MMMM yyyy, HH:mm")
      : null;

    summaries[manual.serviceId] = {
      serviceId: manual.serviceId,
      content: manual.content,
      version: manual.version,
      isActive: manual.isActive,
      isConfirmed: Boolean(manual.confirmedByMasterAt),
      confirmedAtLabel,
    };
  }

  return summaries;
}

function mapReferralInvites(
  rows: Record<string, unknown>[],
): ReferralInviteSummary[] {
  return rows.map((row) => ({
    id: String(row.id),
    referredProfileId: String(row.referred_profile_id),
    referredName: String(row.referred_full_name ?? ""),
    status: row.status === "applied" ? "applied" : "pending",
    createdAt: String(row.created_at),
    appliedAt: row.applied_at ? String(row.applied_at) : null,
  }));
}

export async function getSettingsData() {
  const authProfile = await getCurrentAuthProfile();

  if (!authProfile) {
    if (!isSupabaseConfigured && isDemoMode) {
      return {
        profile: mockProfile,
        services: mockServices,
        availabilityRules,
        serviceManuals: {} as Record<string, ServiceManualSummary>,
        referralInvites: [] as ReferralInviteSummary[],
        source: "mock" as const,
      };
    }

    return null;
  }

  if (authProfile.source === "mock") {
    return {
      profile: authProfile.profile,
      services: mockServices,
      availabilityRules,
      serviceManuals: {} as Record<string, ServiceManualSummary>,
      referralInvites: [] as ReferralInviteSummary[],
      source: "mock" as const,
    };
  }

  const [settingsData, profileMediaRow, serviceManualRows, referralRows] =
    await Promise.all([
      getOwnerSettingsRows({
        profileId: authProfile.profile.id,
      }),
      getOwnerProfileMediaRow({
        profileId: authProfile.profile.id,
      }),
      getOwnerServiceManualRows({
        profileId: authProfile.profile.id,
      }),
      getOwnerReferralRows({
        profileId: authProfile.profile.id,
      }),
    ]);

  return {
    profile: mergeProfileMedia(authProfile.profile, profileMediaRow),
    services: settingsData.services.map((row) => mapService(row)),
    availabilityRules: settingsData.availabilityRules.map((row) =>
      mapAvailabilityRule(row),
    ),
    serviceManuals: buildServiceManualSummaries(
      serviceManualRows,
      authProfile.profile.timezone,
    ),
    referralInvites: mapReferralInvites(referralRows),
    source: "supabase" as const,
  };
}

export async function getTeamDashboardData(): Promise<TeamDashboardData | null> {
  const authProfile = await getCurrentAuthProfile();

  if (!authProfile || authProfile.source === "mock") {
    return null;
  }

  const profile = authProfile.profile;

  if (
    !canManageWorkspace(profile.accountRole) ||
    !isTeamWorkspaceKind(profile.workspaceKind)
  ) {
    return null;
  }

  const teamRows = await getWorkspaceTeamRows({
    workspaceId: profile.workspaceId,
  });

  const members = teamRows.members.map((row) => mapProfile(row));
  const services = teamRows.services.map((row) => mapService(row));
  const bookings = teamRows.bookings.map((row) => mapBooking(row));
  const clients = teamRows.clients.map((row) => mapClient(row));
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const serviceMap = new Map(services.map((service) => [service.id, service]));
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const timezone = profile.timezone;
  const now = DateTime.now().setZone(timezone);
  const todayKey = now.toFormat("yyyy-MM-dd");
  const confirmedBookings = bookings.filter((booking) => booking.status === "confirmed");
  const upcomingConfirmedBookings = confirmedBookings.filter((booking) => {
    const startsAt = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
      timezone,
    );
    return startsAt.toMillis() >= now.toMillis();
  });
  const bookingsTodayCount = confirmedBookings.filter((booking) => {
    const startsAt = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
      timezone,
    );
    return startsAt.toFormat("yyyy-MM-dd") === todayKey;
  }).length;

  const teamMembers = members
    .map((member) => {
      const memberBookings = upcomingConfirmedBookings.filter(
        (booking) => booking.profileId === member.id,
      );
      const nextBooking = memberBookings[0] ?? null;
      const activeServicesCount = services.filter(
        (service) => service.profileId === member.id && service.isActive,
      ).length;
      const clientCount = clients.filter((client) => client.profileId === member.id).length;

      return {
        id: member.id,
        fullName: member.fullName,
        specialty: member.specialty,
        username: member.username,
        email: member.email,
        locationText: member.locationText,
        timezone: member.timezone,
        accountRole: member.accountRole,
        roleLabel: getAccountRoleLabel(member.accountRole),
        accountStatus: member.accountStatus,
        statusLabel: getAccountStatusLabel(member.accountStatus),
        clientCount,
        activeServicesCount,
        upcomingBookingsCount: memberBookings.length,
        nextBookingLabel: nextBooking
          ? formatTeamMoment(nextBooking.startsAt, timezone)
          : null,
        joinedAtLabel: formatTeamJoinDate(member.joinedAt, timezone),
      } satisfies TeamMemberSummary;
    })
    .sort((left, right) => {
      if (left.accountRole !== right.accountRole) {
        if (left.accountRole === "admin") return -1;
        if (right.accountRole === "admin") return 1;
      }

      return left.fullName.localeCompare(right.fullName, "ru");
    });

  const upcomingBookings = upcomingConfirmedBookings
    .slice(0, 10)
    .map((booking) => {
      const member = memberMap.get(booking.profileId);
      const client = clientMap.get(booking.clientId);
      const service = serviceMap.get(booking.serviceId);

      return {
        id: booking.id,
        memberName: member?.fullName ?? "Сотрудник",
        memberUsername: member?.username ?? "",
        clientName: client?.name ?? "Клиент",
        serviceTitle: service?.title ?? "Услуга",
        startsAtLabel: formatTeamMoment(booking.startsAt, timezone),
        sourceLabel: booking.source === "manual" ? "Добавил администратор" : "Онлайн-запись",
      } satisfies TeamUpcomingBookingItem;
    });

  const recentClients = [...clients]
    .sort((left, right) => {
      const leftMoment = left.lastBookingAt || left.createdAt;
      const rightMoment = right.lastBookingAt || right.createdAt;
      return rightMoment.localeCompare(leftMoment);
    })
    .slice(0, 10)
    .map((client) => {
      const member = memberMap.get(client.profileId);

      return {
        id: client.id,
        name: client.name,
        phoneMasked: client.phoneMasked,
        memberName: member?.fullName ?? "Сотрудник",
        memberUsername: member?.username ?? "",
        lastVisitLabel: formatTeamMoment(client.lastBookingAt, timezone),
        notes: client.notes,
      } satisfies TeamRecentClientItem;
    });

  return {
    profile,
    workspace: {
      id: profile.workspaceId,
      name: profile.workspaceName,
      kind: profile.workspaceKind,
      kindLabel: getWorkspaceKindLabel(profile.workspaceKind),
      memberCount: members.length,
      activeMemberCount: members.filter((member) =>
        isAccountActive(member.accountStatus),
      ).length,
      disabledMemberCount: members.filter(
        (member) => !isAccountActive(member.accountStatus),
      ).length,
      staffCount: members.filter((member) => member.accountRole === "staff").length,
      bookingsTodayCount,
      upcomingBookingsCount: upcomingConfirmedBookings.length,
      clientCount: clients.length,
    },
    members: teamMembers,
    upcomingBookings,
    recentClients,
    source: "supabase",
  };
}

export function getPricingData() {
  return pricingPlans;
}

export async function getBookingConfirmationData(
  username: string,
  bookingId: string,
) {
  if (!bookingId) {
    return null;
  }

  if (!isSupabaseConfigured) {
    ensureWorkRuntime("подтверждение записи");
    if (username !== mockProfile.username) {
      return null;
    }

    const booking = getMockBookingConfirmation(bookingId);

    if (!booking || booking.username !== username) {
      return null;
    }

    return {
      clientName: booking.clientName,
      serviceTitle: booking.serviceTitle,
      startsAtLabel: humanizeBookingDate({
        startsAtIso: booking.startsAtIso,
        timezone: mockProfile.timezone,
      }),
      cancellationToken: booking.cancellationToken,
      themePresetId: mockProfile.bookingThemePresetId,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("id, timezone, booking_theme_preset")
    .eq("username", username)
    .maybeSingle();

  if (profileError) {
    if (isRetryableSupabaseNetworkError(profileError)) {
      throw new Error(
        "Нет связи с подтверждением записи. Проверь Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить профиль мастера.");
  }

  if (!profileRow) {
    return null;
  }

  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select("id, profile_id, client_id, service_id, starts_at, cancellation_token")
    .eq("id", bookingId)
    .eq("profile_id", profileRow.id)
    .maybeSingle();

  if (bookingError) {
    throw new Error("Не получилось загрузить запись.");
  }

  if (!bookingRow) {
    return null;
  }

  const [{ data: clientRow, error: clientError }, { data: serviceRow, error: serviceError }] =
    await Promise.all([
      admin
        .from("clients")
        .select("name")
        .eq("id", bookingRow.client_id)
        .maybeSingle(),
      admin
        .from("services")
        .select("title")
        .eq("id", bookingRow.service_id)
        .maybeSingle(),
    ]);

  if (clientError || serviceError) {
    throw new Error("Не получилось собрать подтверждение записи.");
  }

  if (!clientRow || !serviceRow) {
    return null;
  }

  return {
    clientName: String(clientRow.name),
    serviceTitle: String(serviceRow.title),
    startsAtLabel: humanizeBookingDate({
      startsAtIso: String(bookingRow.starts_at),
      timezone: String(profileRow.timezone ?? "Europe/Simferopol"),
    }),
    cancellationToken: String(bookingRow.cancellation_token ?? ""),
    themePresetId: normalizeBookingThemePresetId(profileRow.booking_theme_preset),
  };
}

export async function getBookingCancellationData(cancellationToken: string) {
  if (!cancellationToken) {
    return null;
  }

  if (!isSupabaseConfigured) {
    ensureWorkRuntime("отмена записи клиентом");

    const booking = bookings.find((item) => item.cancellationToken === cancellationToken);
    if (!booking) {
      return null;
    }

    const client = clients.find((item) => item.id === booking.clientId);
    const service = mockServices.find((item) => item.id === booking.serviceId);

    if (!client || !service) {
      return null;
    }

    const canCancel = isCancellationAllowed({
      startsAtIso: booking.startsAt,
      cancellationTokenExpiresAt: booking.cancellationTokenExpiresAt,
      timezone: mockProfile.timezone,
      status: booking.status,
    });

    return {
      bookingId: booking.id,
      cancellationToken: booking.cancellationToken,
      clientName: client.name,
      serviceTitle: service.title,
      serviceId: service.id,
      serviceDurationMinutes: service.durationMinutes,
      masterName: mockProfile.fullName,
      timezone: mockProfile.timezone,
      startsAtLabel: humanizeBookingDate({
        startsAtIso: booking.startsAt,
        timezone: mockProfile.timezone,
      }),
      startsAtIso: booking.startsAt,
      username: mockProfile.username,
      status: booking.status,
      canCancel,
      cancellationDeadlineLabel: booking.cancellationTokenExpiresAt
        ? humanizeBookingDate({
            startsAtIso: booking.cancellationTokenExpiresAt,
            timezone: mockProfile.timezone,
          })
        : null,
      bookingSlots: buildBookingSlotsForService({
        profile: mockProfile,
        service,
        availabilityRules,
        blockedSlots,
        bookings: bookings.filter((item) => item.id !== booking.id),
      }),
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select(PUBLIC_BOOKING_COLUMNS)
    .eq("cancellation_token", cancellationToken)
    .maybeSingle();

  if (bookingError) {
    throw new Error("Не получилось загрузить запись по ссылке отмены.");
  }

  if (!bookingRow) {
    return null;
  }

  const cancellationBookingRow = bookingRow as unknown as Record<string, unknown>;

  const [{ data: clientRow, error: clientError }, { data: serviceRow, error: serviceError }, { data: profileRow, error: profileError }] =
    await Promise.all([
      admin
        .from("clients")
        .select("name")
        .eq("id", cancellationBookingRow.client_id)
        .maybeSingle(),
      admin
        .from("services")
        .select(PUBLIC_SERVICE_COLUMNS)
        .eq("id", cancellationBookingRow.service_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select(PUBLIC_PROFILE_BASE_COLUMNS)
        .eq("id", cancellationBookingRow.profile_id)
        .maybeSingle(),
    ]);

  if (clientError || serviceError || profileError) {
    throw new Error("Не получилось собрать данные для отмены записи.");
  }

  if (!clientRow || !serviceRow || !profileRow) {
    return null;
  }

  const cancellationProfileRow = profileRow as unknown as Record<string, unknown>;
  const cancellationServiceRow = serviceRow as unknown as Record<string, unknown>;
  const cancellationClientRow = clientRow as unknown as Record<string, unknown>;

  const timezone = String(cancellationProfileRow.timezone ?? "Europe/Simferopol");
  const status = String(cancellationBookingRow.status) as
    | "confirmed"
    | "cancelled_by_client"
    | "cancelled_by_master";

  const [availabilityResult, blockedResult, bookingResult] = await Promise.all([
    admin
      .from("availability_rules")
      .select(PUBLIC_AVAILABILITY_RULE_COLUMNS)
      .eq("profile_id", cancellationProfileRow.id)
      .order("weekday"),
    admin
      .from("blocked_slots")
      .select(PUBLIC_BLOCKED_SLOT_COLUMNS)
      .eq("profile_id", cancellationProfileRow.id)
      .order("starts_at"),
    admin
      .from("bookings")
      .select(PUBLIC_BOOKING_COLUMNS)
      .eq("profile_id", cancellationProfileRow.id)
      .eq("status", "confirmed")
      .neq("id", cancellationBookingRow.id)
      .order("starts_at"),
  ]);

  if (availabilityResult.error || blockedResult.error || bookingResult.error) {
    throw new Error("Не получилось загрузить свободное время для переноса записи.");
  }

  const mappedProfile = mapProfile(cancellationProfileRow);
  const mappedService = mapService(cancellationServiceRow);

  return {
    bookingId: String(cancellationBookingRow.id),
    cancellationToken: String(cancellationBookingRow.cancellation_token),
    profileId: String(cancellationProfileRow.id),
    workspaceId: String(cancellationProfileRow.workspace_id ?? cancellationProfileRow.id),
    clientName: String(cancellationClientRow.name),
    serviceTitle: String(cancellationServiceRow.title),
    serviceId: String(cancellationServiceRow.id),
    serviceDurationMinutes: Number(cancellationServiceRow.duration_minutes),
    masterName: String(cancellationProfileRow.full_name),
    timezone,
    startsAtLabel: humanizeBookingDate({
      startsAtIso: String(cancellationBookingRow.starts_at),
      timezone,
    }),
    startsAtIso: String(cancellationBookingRow.starts_at),
    username: String(cancellationProfileRow.username),
    status,
    canCancel: isCancellationAllowed({
      startsAtIso: String(cancellationBookingRow.starts_at),
      cancellationTokenExpiresAt: cancellationBookingRow.cancellation_token_expires_at
        ? String(cancellationBookingRow.cancellation_token_expires_at)
        : null,
      timezone,
      status,
    }),
    cancellationDeadlineLabel: cancellationBookingRow.cancellation_token_expires_at
      ? humanizeBookingDate({
          startsAtIso: String(cancellationBookingRow.cancellation_token_expires_at),
          timezone,
        })
      : null,
    bookingSlots: buildBookingSlotsForService({
      profile: mappedProfile,
      service: mappedService,
      availabilityRules: asRecords(availabilityResult.data).map((row) =>
        mapAvailabilityRule(row),
      ),
      blockedSlots: asRecords(blockedResult.data).map((row) => mapBlockedSlot(row)),
      bookings: asRecords(bookingResult.data).map((row) => mapBooking(row)),
    }),
  };
}
