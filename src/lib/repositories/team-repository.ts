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
  "subscription_tier",
  "monthly_booking_limit",
  "booking_window_days",
  "slot_interval_minutes",
  "buffer_minutes",
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
  "prepayment_type",
  "prepayment_value",
].join(",");

const TEAM_BOOKING_COLUMNS = [
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

export async function getWorkspaceTeamRows(input: { workspaceId: string }) {
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
      clients: [] as Row[],
    };
  }

  const [serviceResult, bookingResult, clientResult] = await Promise.all([
    admin
      .from("services")
      .select(TEAM_SERVICE_COLUMNS)
      .in("profile_id", memberIds)
      .order("sort_order", { ascending: true }),
    admin
      .from("bookings")
      .select(TEAM_BOOKING_COLUMNS)
      .in("profile_id", memberIds)
      .order("starts_at", { ascending: true }),
    admin
      .from("clients")
      .select(TEAM_CLIENT_COLUMNS)
      .in("profile_id", memberIds)
      .order("last_booking_at", { ascending: false }),
  ]);

  if (serviceResult.error || bookingResult.error || clientResult.error) {
    if (
      [
        serviceResult.error,
        bookingResult.error,
        clientResult.error,
      ].some((error) => isRetryableSupabaseNetworkError(error))
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
    clients: asRows(clientResult.data),
  };
}
