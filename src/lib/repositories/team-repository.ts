import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRetryableSupabaseNetworkError } from "@/lib/supabase/auth-errors";

type Row = Record<string, unknown>;

function asRows(data: unknown[] | null) {
  return (data ?? []) as Row[];
}

const TEAM_PROFILE_COLUMNS = [
  "id",
  "email",
  "password_auth_id",
  "full_name",
  "username",
  "specialty",
  "bio",
  "location_text",
  "timezone",
  "telegram_chat_id",
  "booking_theme_preset",
  "brand_theme",
  "brand_theme_applied_at",
  "subscription_tier",
  "subscription_until",
  "subscription_paused_until",
  "monthly_booking_limit",
  "booking_window_days",
  "slot_interval_minutes",
  "cancellation_notice_hours",
  "client_reminder_hours",
  "master_reminder_hours",
  "late_cancel_threshold_hours",
  "created_at",
  "workspace_id",
  "workspace_name",
  "workspace_kind",
  "account_role",
  "account_status",
  "created_by_profile_id",
  "avatar_url",
  "portfolio_works",
  // Скидка на горящие окошки мастера: страница студии и карточка админа
  // показывают её так же, как личная страница (миграция 202610210001).
  "hot_windows_discount_percent",
  "hot_windows_discount_until",
].join(",");

const TEAM_SERVICE_COLUMNS = [
  "id",
  "profile_id",
  "title",
  "description",
  "duration_minutes",
  "price",
  "is_active",
  "sort_order",
  "repeat_interval_days",
  "buffer_minutes",
  "prepayment_type",
  "prepayment_value",
  "discount_percent",
  "discount_starts_on",
  "discount_ends_on",
  "first_visit_discount_percent",
].join(",");

const TEAM_BOOKING_COLUMNS = [
  "id",
  "profile_id",
  "client_id",
  "service_id",
  "status",
  "starts_at",
  "ends_at",
  "busy_until",
  "source",
  "client_note",
  "cancellation_token",
  "cancellation_token_expires_at",
  "created_at",
  "cancelled_at",
  "visit_status",
  "visit_status_set_at",
  "prepayment_required",
].join(",");

const TEAM_CLIENT_COLUMNS = [
  "id",
  "profile_id",
  "name",
  "phone_encrypted",
  "phone_last4",
  "notes",
  "created_at",
  "last_booking_at",
].join(",");

// Сколько мест занято в рабочем пространстве: считаем активных сотрудников
// (account_role = 'staff'). Администратор места не занимает — он и есть
// владелец тарифа. Отключённые сотрудники не считаются и не оплачиваются.
// Под этот запрос есть индекс profiles_workspace_id_account_status_idx.
export async function countActiveWorkspaceSeats(
  client: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  if (!workspaceId) {
    return 0;
  }

  const { count, error } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("account_role", "staff")
    .eq("account_status", "active");

  if (error) {
    throw new Error("Не получилось посчитать сотрудников рабочего пространства.");
  }

  return count ?? 0;
}

// Данные команды для публичной страницы студии: только то, из чего
// считаются свободные окна. Клиентов и прошлые записи она не показывает, а
// getWorkspaceTeamRows тянул их целиком на каждое открытие страницы.
export async function getPublicWorkspaceTeamRows(input: {
  workspaceId: string;
  bookingsEndAfterIso: string;
}) {
  const admin = createSupabaseAdminClient();

  const { data: memberRows, error: memberError } = await admin
    .from("profiles")
    .select(TEAM_PROFILE_COLUMNS)
    .eq("workspace_id", input.workspaceId)
    .order("created_at");

  if (memberError) {
    if (isRetryableSupabaseNetworkError(memberError)) {
      throw new Error(
        "Нет связи с командой. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить сотрудников.");
  }

  const normalizedMemberRows = asRows(memberRows);
  const memberIds = normalizedMemberRows.map((row) => String(row.id));

  if (memberIds.length === 0) {
    return { members: [] as Row[], services: [] as Row[], bookings: [] as Row[] };
  }

  const [serviceResult, bookingResult] = await Promise.all([
    admin
      .from("services")
      .select(TEAM_SERVICE_COLUMNS)
      .in("profile_id", memberIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("bookings")
      .select(TEAM_BOOKING_COLUMNS)
      .in("profile_id", memberIds)
      .in("status", ["confirmed", "pending_payment"])
      .gt("ends_at", input.bookingsEndAfterIso)
      .order("starts_at", { ascending: true }),
  ]);

  if (serviceResult.error || bookingResult.error) {
    if (
      [serviceResult.error, bookingResult.error].some((error) =>
        isRetryableSupabaseNetworkError(error),
      )
    ) {
      throw new Error(
        "Нет связи с командой. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить данные команды.");
  }

  return {
    members: normalizedMemberRows,
    services: asRows(serviceResult.data),
    bookings: asRows(bookingResult.data),
  };
}

function throwTeamLoadError(errors: unknown[]) {
  if (errors.some((error) => isRetryableSupabaseNetworkError(error))) {
    throw new Error(
      "Нет связи с командой. Проверь подключение к Supabase и попробуй еще раз.",
    );
  }

  throw new Error("Не получилось загрузить данные команды.");
}

// Кабинет администратора студии показывает сводку: сколько у сотрудника
// клиентов и будущих записей, десять ближайших записей и десять последних
// клиентов. Раньше ради неё грузились все записи за всё время и вся база
// клиентов с расшифровкой каждого телефона — теперь только то, что видно.
export async function getTeamDashboardRows(input: {
  workspaceId: string;
  bookingsFromIso: string;
  nowIso: string;
  listLimit: number;
}) {
  const admin = createSupabaseAdminClient();

  const { data: memberRows, error: memberError } = await admin
    .from("profiles")
    .select(TEAM_PROFILE_COLUMNS)
    .eq("workspace_id", input.workspaceId)
    .order("created_at");

  if (memberError) {
    if (isRetryableSupabaseNetworkError(memberError)) {
      throw new Error(
        "Нет связи с командой. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить сотрудников.");
  }

  const normalizedMemberRows = asRows(memberRows);
  const memberIds = normalizedMemberRows.map((row) => String(row.id));

  if (memberIds.length === 0) {
    return {
      members: [] as Row[],
      services: [] as Row[],
      bookings: [] as Row[],
      clientCounts: {} as Record<string, number>,
      recentClients: [] as Row[],
      upcomingClients: [] as Row[],
    };
  }

  const [
    serviceResult,
    bookingResult,
    recentWithBookingResult,
    recentWithoutBookingResult,
    ...countResults
  ] = await Promise.all([
    admin
      .from("services")
      .select(TEAM_SERVICE_COLUMNS)
      .in("profile_id", memberIds)
      .order("sort_order", { ascending: true }),
    // С начала сегодняшнего дня: из них считаются «записей сегодня» и
    // будущие записи каждого сотрудника.
    admin
      .from("bookings")
      .select(TEAM_BOOKING_COLUMNS)
      .in("profile_id", memberIds)
      .eq("status", "confirmed")
      .gte("starts_at", input.bookingsFromIso)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true }),
    // «Последние клиенты» сортируются по last_booking_at, а у кого его нет —
    // по created_at. Верх каждой из двух групп вместе дают точный верх.
    admin
      .from("clients")
      .select(TEAM_CLIENT_COLUMNS)
      .in("profile_id", memberIds)
      .not("last_booking_at", "is", null)
      .order("last_booking_at", { ascending: false })
      .limit(input.listLimit),
    admin
      .from("clients")
      .select(TEAM_CLIENT_COLUMNS)
      .in("profile_id", memberIds)
      .is("last_booking_at", null)
      .order("created_at", { ascending: false })
      .limit(input.listLimit),
    ...memberIds.map((memberId) =>
      admin
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", memberId),
    ),
  ]);

  const firstErrors = [
    serviceResult.error,
    bookingResult.error,
    recentWithBookingResult.error,
    recentWithoutBookingResult.error,
    ...countResults.map((result) => result.error),
  ].filter(Boolean);

  if (firstErrors.length > 0) {
    throwTeamLoadError(firstErrors);
  }

  const bookings = asRows(bookingResult.data);
  const nowMs = Date.parse(input.nowIso);
  const upcomingClientIds = [
    ...new Set(
      bookings
        .filter((row) => Date.parse(String(row.starts_at)) >= nowMs)
        .slice(0, input.listLimit)
        .map((row) => String(row.client_id)),
    ),
  ];

  let upcomingClients: Row[] = [];

  if (upcomingClientIds.length > 0) {
    const upcomingClientResult = await admin
      .from("clients")
      .select("id,profile_id,name")
      .in("id", upcomingClientIds);

    if (upcomingClientResult.error) {
      throwTeamLoadError([upcomingClientResult.error]);
    }

    upcomingClients = asRows(upcomingClientResult.data);
  }

  return {
    members: normalizedMemberRows,
    services: asRows(serviceResult.data),
    bookings,
    clientCounts: Object.fromEntries(
      memberIds.map((memberId, index) => [memberId, countResults[index]?.count ?? 0]),
    ),
    recentClients: [
      ...asRows(recentWithBookingResult.data),
      ...asRows(recentWithoutBookingResult.data),
    ],
    upcomingClients,
  };
}
