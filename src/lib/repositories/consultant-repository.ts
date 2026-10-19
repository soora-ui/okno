import {
  mapAvailabilityRule,
  mapBlockedSlot,
  mapBooking,
  mapProfile,
  mapService,
} from "@/lib/mappers/domain";
import { isSupabaseConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { buildBookingSlotsForService } from "@/lib/slots";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";
import type { BookingSlot, Profile, Service } from "@/lib/mock-data";

// Чтение данных AI-консультанта со стороны КЛИЕНТА.
//
// Отдельный репозиторий, а не функция в owner-repository, по одной причине:
// там всё ходит под RLS от лица мастера («владелец управляет своими
// мануалами»), а здесь читает аноним. Значит сервисная роль — и значит каждый
// фильтр приходится ставить руками, потому что политика больше ничего не
// проверяет за нас.
//
// Отсюда же требование к мануалу: is_active И непустой confirmed_by_master_at.
// В схеме это два независимых поля, и хотя server action всегда выставляет их
// вместе, ставить клиентский путь в зависимость от чужой аккуратности нельзя:
// цена ошибки — совет по процедуре от лица мастера, которого мастер не давал.

const CONSULTANT_PROFILE_COLUMNS = [
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
  "account_role",
  "account_status",
].join(",");

const CONSULTANT_SERVICE_COLUMNS = [
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
].join(",");

export type ConsultantContext = {
  profile: Profile;
  service: Service;
  manual: string;
};

/**
 * Услуга, её мастер и подтверждённый мануал. null — консультировать не по чему:
 * услуги нет, она скрыта, мануала нет или мастер его не подтвердил.
 *
 * Тариф здесь НЕ проверяется: гейт стоит в роуте, чтобы проверка возможностей
 * подписки жила в одном месте со всеми остальными и не разъехалась с ним.
 */
export async function getConsultantContext(input: {
  serviceId: string;
}): Promise<ConsultantContext | null> {
  // Без Supabase сервис работает на моках (демо, локальная разработка):
  // мануалов там нет, а createSupabaseAdminClient на пустом URL падает.
  if (!isSupabaseConfigured) {
    return null;
  }

  const admin = createSupabaseAdminClient();

  const { data: manualRow, error: manualError } = await admin
    .from("service_manuals")
    .select("content, service_id")
    .eq("service_id", input.serviceId)
    .eq("is_active", true)
    .not("confirmed_by_master_at", "is", null)
    .maybeSingle();

  if (manualError) {
    // Миграция мануалов ещё не прогнана — фичи просто нет, это не ошибка.
    if (!isSupabaseMissingTableError(manualError, "service_manuals")) {
      logError("Consultant manual read failed", { error: manualError });
    }
    return null;
  }

  const manual = String(manualRow?.content ?? "").trim();
  if (!manual) {
    return null;
  }

  const { data: serviceRow, error: serviceError } = await admin
    .from("services")
    .select(CONSULTANT_SERVICE_COLUMNS)
    .eq("id", input.serviceId)
    .eq("is_active", true)
    .maybeSingle();

  if (serviceError || !serviceRow) {
    return null;
  }

  const service = mapService(serviceRow as unknown as Record<string, unknown>);

  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select(CONSULTANT_PROFILE_COLUMNS)
    .eq("id", service.profileId)
    .maybeSingle();

  if (profileError || !profileRow) {
    return null;
  }

  return {
    profile: mapProfile(profileRow as unknown as Record<string, unknown>),
    service,
    manual,
  };
}

export type ConsultantBooking = {
  bookingId: string;
  profileId: string;
  serviceId: string;
  startsAtIso: string;
};

/**
 * Запись по токену из ссылки, которую клиент получил в SMS. Токен здесь —
 * единственное доказательство того, что человек имеет отношение к этой
 * записи, поэтому больше ничего и не спрашивается.
 *
 * Отменённые записи не в счёт: от отменённого визита нечего отсчитывать срок
 * повторного, да и консультировать по услуге, на которую клиент не пришёл,
 * не о чем.
 */
export async function getConsultantBooking(input: {
  cancellationToken: string;
}): Promise<ConsultantBooking | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("bookings")
    .select("id, profile_id, service_id, starts_at, status")
    .eq("cancellation_token", input.cancellationToken)
    .in("status", ["confirmed", "pending_payment"])
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    bookingId: String(data.id),
    profileId: String(data.profile_id),
    serviceId: String(data.service_id),
    startsAtIso: String(data.starts_at),
  };
}

/**
 * Свободное время услуги начиная с указанной даты. Отдельный вызов, а не
 * переиспользование слотов со страницы: там выдача начинается с сегодня и
 * обрывается через maxDaysToShow дней СО СЛОТАМИ, поэтому день повторного
 * визита в неё обычно не попадает.
 */
export async function getConsultantSlotsFrom(input: {
  profile: Profile;
  service: Service;
  fromDate: string;
  excludeBookingId?: string;
}): Promise<BookingSlot[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const admin = createSupabaseAdminClient();

  const bookingsQuery = admin
    .from("bookings")
    .select(
      "id, profile_id, client_id, service_id, status, starts_at, ends_at, busy_until, created_at",
    )
    .eq("profile_id", input.profile.id)
    .in("status", ["confirmed", "pending_payment"]);

  const [availabilityResult, blockedResult, bookingResult] = await Promise.all([
    admin
      .from("availability_rules")
      .select("id, profile_id, weekday, start_time, end_time, is_active")
      .eq("profile_id", input.profile.id)
      .order("weekday"),
    admin
      .from("blocked_slots")
      .select("id, profile_id, starts_at, ends_at, reason")
      .eq("profile_id", input.profile.id)
      .order("starts_at"),
    input.excludeBookingId
      ? bookingsQuery.neq("id", input.excludeBookingId)
      : bookingsQuery,
  ]);

  if (availabilityResult.error || blockedResult.error || bookingResult.error) {
    logError("Consultant slots read failed", {
      profileId: input.profile.id,
      error:
        availabilityResult.error ?? blockedResult.error ?? bookingResult.error,
    });
    return [];
  }

  return buildBookingSlotsForService({
    profile: input.profile,
    service: input.service,
    availabilityRules: (availabilityResult.data ?? []).map((row) =>
      mapAvailabilityRule(row as Record<string, unknown>),
    ),
    blockedSlots: (blockedResult.data ?? []).map((row) =>
      mapBlockedSlot(row as Record<string, unknown>),
    ),
    bookings: (bookingResult.data ?? []).map((row) =>
      mapBooking(row as Record<string, unknown>),
    ),
    fromDate: input.fromDate,
    // Достаточно первого подходящего дня, но брать ровно один нельзя: он
    // может оказаться занят целиком, и тогда предложить будет нечего.
    maxDaysToShow: 3,
  });
}

/**
 * Услуги мастера, по которым есть о чём консультировать. Нужно публичной
 * странице: там запись ещё не выбрана, и клиенту показывается список услуг с
 * подтверждённым мануалом.
 */
export async function getServiceIdsWithManual(input: {
  profileId: string;
}): Promise<string[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("service_manuals")
    .select("service_id")
    .eq("profile_id", input.profileId)
    .eq("is_active", true)
    .not("confirmed_by_master_at", "is", null);

  if (error) {
    if (!isSupabaseMissingTableError(error, "service_manuals")) {
      logError("Consultant manual list failed", { error });
    }
    return [];
  }

  return (data ?? []).map((row) => String(row.service_id));
}
