import { DateTime } from "luxon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isNonFatalSupabaseSessionError,
  isRetryableSupabaseNetworkError,
} from "@/lib/supabase/auth-errors";

type Row = Record<string, unknown>;

const PROFILE_COLUMNS = [
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

const PROFILE_MEDIA_COLUMNS = [
  "avatar_url",
  "portfolio_works",
].join(",");

const SERVICE_COLUMNS = [
  "id",
  "profile_id",
  "title",
  "description",
  "duration_minutes",
  "price",
  "is_active",
  "sort_order",
].join(",");

const BOOKING_COLUMNS = [
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

const CLIENT_COLUMNS = [
  "id",
  "profile_id",
  "name",
  "phone_encrypted",
  "phone_last4",
  "notes",
  "created_at",
  "last_booking_at",
].join(",");

const AVAILABILITY_RULE_COLUMNS = [
  "id",
  "profile_id",
  "weekday",
  "start_time",
  "end_time",
  "is_active",
].join(",");

const BLOCKED_SLOT_COLUMNS = [
  "id",
  "profile_id",
  "starts_at",
  "ends_at",
  "reason",
].join(",");

const NOTIFICATION_EVENT_COLUMNS = [
  "id",
  "profile_id",
  "type",
  "status",
  "target",
  "created_at",
].join(",");

function buildMonthRange(timezone: string) {
  const monthStart = DateTime.now().setZone(timezone).startOf("month");
  const monthEnd = monthStart.plus({ months: 1 });

  return {
    monthStartUtc: monthStart.toUTC().toISO() ?? new Date().toISOString(),
    monthEndUtc: monthEnd.toUTC().toISO() ?? new Date().toISOString(),
  };
}

function asRows(data: unknown[] | null) {
  return (data ?? []) as Row[];
}

export async function getOwnerProfileRow() {
  const supabase = await createSupabaseServerClient();
  let user: { id: string } | null = null;
  let userError: unknown = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user ? { id: result.data.user.id } : null;
    userError = result.error;
  } catch (error) {
    if (isNonFatalSupabaseSessionError(error)) {
      return null;
    }

    throw error;
  }

  if (userError) {
    if (isNonFatalSupabaseSessionError(userError)) {
      return null;
    }

    throw new Error("Не получилось проверить сессию кабинета.");
  }

  if (!user) {
    return null;
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("password_auth_id", user.id)
    .maybeSingle();

  if (profileError) {
    if (isRetryableSupabaseNetworkError(profileError)) {
      throw new Error(
        "Нет связи с кабинетом. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить профиль мастера.");
  }

  if (!profileRow) {
    return null;
  }

  return profileRow as unknown as Row;
}

export async function getOwnerProfileMediaRow(input: { profileId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_MEDIA_COLUMNS)
    .eq("id", input.profileId)
    .maybeSingle();

  if (error) {
    if (isRetryableSupabaseNetworkError(error)) {
      throw new Error(
        "Нет связи с медиа профиля. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить медиа профиля.");
  }

  return data as unknown as Row | null;
}

export async function getOwnerDashboardRows(input: {
  profileId: string;
  timezone: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { monthStartUtc, monthEndUtc } = buildMonthRange(input.timezone);

  const [serviceResult, bookingResult, clientResult, monthlyBookingsUsedResult] =
    await Promise.all([
      supabase
        .from("services")
        .select(SERVICE_COLUMNS)
        .eq("profile_id", input.profileId)
        .order("sort_order"),
      supabase
        .from("bookings")
        .select(BOOKING_COLUMNS)
        .eq("profile_id", input.profileId)
        .eq("status", "confirmed")
        .order("starts_at"),
      supabase
        .from("clients")
        .select(CLIENT_COLUMNS)
        .eq("profile_id", input.profileId)
        .order("last_booking_at", { ascending: false }),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", input.profileId)
        .eq("status", "confirmed")
        .or(
          `and(starts_at.gte.${monthStartUtc},starts_at.lt.${monthEndUtc}),and(created_at.gte.${monthStartUtc},created_at.lt.${monthEndUtc})`,
        ),
    ]);

  if (
    serviceResult.error ||
    bookingResult.error ||
    clientResult.error ||
    monthlyBookingsUsedResult.error
  ) {
    if (
      [
        serviceResult.error,
        bookingResult.error,
        clientResult.error,
        monthlyBookingsUsedResult.error,
      ].some((error) => isRetryableSupabaseNetworkError(error))
    ) {
      throw new Error(
        "Нет связи с кабинетом. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить данные кабинета.");
  }

  return {
    services: asRows(serviceResult.data),
    bookings: asRows(bookingResult.data),
    clients: asRows(clientResult.data),
    monthlyBookingsUsed: monthlyBookingsUsedResult.count ?? 0,
  };
}

export async function getOwnerScheduleRows(input: { profileId: string }) {
  const supabase = await createSupabaseServerClient();

  const [bookingResult, availabilityResult, blockedResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("profile_id", input.profileId)
      .eq("status", "confirmed")
      .order("starts_at"),
    supabase
      .from("availability_rules")
      .select(AVAILABILITY_RULE_COLUMNS)
      .eq("profile_id", input.profileId)
      .order("weekday"),
    supabase
      .from("blocked_slots")
      .select(BLOCKED_SLOT_COLUMNS)
      .eq("profile_id", input.profileId)
      .order("starts_at"),
  ]);

  if (bookingResult.error || availabilityResult.error || blockedResult.error) {
    if (
      [
        bookingResult.error,
        availabilityResult.error,
        blockedResult.error,
      ].some((error) => isRetryableSupabaseNetworkError(error))
    ) {
      throw new Error(
        "Нет связи с кабинетом. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить расписание кабинета.");
  }

  return {
    bookings: asRows(bookingResult.data),
    availabilityRules: asRows(availabilityResult.data),
    blockedSlots: asRows(blockedResult.data),
  };
}

export async function getOwnerClientsRows(input: { profileId: string }) {
  const supabase = await createSupabaseServerClient();

  const [serviceResult, bookingResult, clientResult] = await Promise.all([
    supabase
      .from("services")
      .select(SERVICE_COLUMNS)
      .eq("profile_id", input.profileId)
      .order("sort_order"),
    supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("profile_id", input.profileId)
      .order("starts_at"),
    supabase
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("profile_id", input.profileId)
      .order("last_booking_at", { ascending: false }),
  ]);

  if (serviceResult.error || bookingResult.error || clientResult.error) {
    if (
      [serviceResult.error, bookingResult.error, clientResult.error].some((error) =>
        isRetryableSupabaseNetworkError(error),
      )
    ) {
      throw new Error(
        "Нет связи с кабинетом. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить клиентов кабинета.");
  }

  return {
    services: asRows(serviceResult.data),
    bookings: asRows(bookingResult.data),
    clients: asRows(clientResult.data),
  };
}

export async function getOwnerSettingsRows(input: { profileId: string }) {
  const supabase = await createSupabaseServerClient();

  const [serviceResult, availabilityResult] = await Promise.all([
    supabase
      .from("services")
      .select(SERVICE_COLUMNS)
      .eq("profile_id", input.profileId)
      .order("sort_order"),
    supabase
      .from("availability_rules")
      .select(AVAILABILITY_RULE_COLUMNS)
      .eq("profile_id", input.profileId)
      .order("weekday"),
  ]);

  if (serviceResult.error || availabilityResult.error) {
    if (
      [serviceResult.error, availabilityResult.error].some((error) =>
        isRetryableSupabaseNetworkError(error),
      )
    ) {
      throw new Error(
        "Нет связи с кабинетом. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить настройки кабинета.");
  }

  return {
    services: asRows(serviceResult.data),
    availabilityRules: asRows(availabilityResult.data),
  };
}

export async function getOwnerNotificationRows(input: {
  profileId: string;
  timezone: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { monthStartUtc, monthEndUtc } = buildMonthRange(input.timezone);

  const [notificationResult, monthlyBookingsUsedResult] = await Promise.all([
    supabase
      .from("notification_events")
      .select(NOTIFICATION_EVENT_COLUMNS)
      .eq("profile_id", input.profileId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", input.profileId)
      .eq("status", "confirmed")
      .or(
        `and(starts_at.gte.${monthStartUtc},starts_at.lt.${monthEndUtc}),and(created_at.gte.${monthStartUtc},created_at.lt.${monthEndUtc})`,
      ),
  ]);

  if (notificationResult.error || monthlyBookingsUsedResult.error) {
    if (
      isRetryableSupabaseNetworkError(notificationResult.error) ||
      isRetryableSupabaseNetworkError(monthlyBookingsUsedResult.error)
    ) {
      throw new Error(
        "Нет связи с кабинетом. Проверь подключение к Supabase и попробуй еще раз.",
      );
    }

    throw new Error("Не получилось загрузить уведомления кабинета.");
  }

  return {
    notificationEvents: asRows(notificationResult.data),
    monthlyBookingsUsed: monthlyBookingsUsedResult.count ?? 0,
  };
}
