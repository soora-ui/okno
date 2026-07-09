import type { Profile } from "@/lib/mock-data";
import { decryptPhone } from "@/lib/booking";
import { normalizeBookingThemePresetId } from "@/lib/booking-theme-presets";
import { normalizeBookingPageSettings } from "@/lib/booking-page-settings";
import {
  defaultAvatarUrl,
  getStoredProfileMediaPath,
  parsePortfolioWorks,
  resolveProfileMediaUrl,
} from "@/lib/profile-media";
import {
  normalizeAccountRole,
  normalizeAccountStatus,
  normalizeWorkspaceKind,
} from "@/lib/workspace";

export function mapProfile(row: Record<string, unknown>): Profile {
  const media = mapProfileMedia(row);

  return {
    id: String(row.id),
    email: String(row.email),
    passwordAuthId: String(row.password_auth_id),
    fullName: String(row.full_name),
    username: String(row.username),
    specialty: String(row.specialty),
    bio: String(row.bio ?? ""),
    locationText: String(row.location_text ?? ""),
    timezone: String(row.timezone ?? "Europe/Simferopol"),
    address: String(row.address ?? ""),
    telegramChatId: row.telegram_chat_id ? String(row.telegram_chat_id) : null,
    avatarUrl: media.avatarUrl,
    avatarPath: media.avatarPath,
    portfolioWorks: media.portfolioWorks,
    bookingThemePresetId: normalizeBookingThemePresetId(row.booking_theme_preset),
    bookingPageSettings: normalizeBookingPageSettings(row.booking_page_settings),
    subscriptionTier: row.subscription_tier === "pro" ? "pro" : "free",
    subscriptionUntil: row.subscription_until
      ? String(row.subscription_until)
      : null,
    monthlyBookingLimit: Number(row.monthly_booking_limit ?? 50),
    monthlyBookingsUsed: Number(row.monthly_bookings_used ?? 0),
    bookingWindowDays: Number(row.booking_window_days ?? 30),
    slotIntervalMinutes: Number(row.slot_interval_minutes ?? 30),
    bufferMinutes: Number(row.buffer_minutes ?? 15),
    cancellationNoticeHours: Number(row.cancellation_notice_hours ?? 2),
    clientReminderHours: Number(row.client_reminder_hours ?? 24),
    masterReminderHours: Number(row.master_reminder_hours ?? 2),
    joinedAt: String(row.created_at),
    workspaceId: String(row.workspace_id ?? row.id),
    workspaceName: String(row.workspace_name ?? row.full_name ?? "okno"),
    workspaceKind: normalizeWorkspaceKind(row.workspace_kind),
    accountRole: normalizeAccountRole(row.account_role),
    accountStatus: normalizeAccountStatus(row.account_status),
    createdByProfileId: row.created_by_profile_id
      ? String(row.created_by_profile_id)
      : null,
  };
}

export function mapProfileMedia(row: Record<string, unknown>) {
  return {
    avatarUrl:
      resolveProfileMediaUrl(String(row.avatar_url ?? "")) || defaultAvatarUrl,
    avatarPath: getStoredProfileMediaPath(String(row.avatar_url ?? "")),
    portfolioWorks: parsePortfolioWorks(row.portfolio_works),
  };
}

export function mergeProfileMedia(
  profile: Profile,
  row: Record<string, unknown> | null | undefined,
): Profile {
  if (!row) {
    return profile;
  }

  return {
    ...profile,
    ...mapProfileMedia(row),
  };
}

export function mapService(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    title: String(row.title),
    description: String(row.description ?? ""),
    durationMinutes: Number(row.duration_minutes),
    price: Number(row.price),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function mapServiceManual(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    serviceId: String(row.service_id),
    profileId: String(row.profile_id),
    content: String(row.content ?? ""),
    version: Number(row.version ?? 1),
    isActive: Boolean(row.is_active),
    confirmedByMasterAt: row.confirmed_by_master_at
      ? String(row.confirmed_by_master_at)
      : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapClient(row: Record<string, unknown>) {
  const phone = row.phone_encrypted ? decryptPhone(String(row.phone_encrypted)) : "";
  const last4 = String(row.phone_last4 ?? "");
  const masked = phone
    ? `${phone.slice(0, Math.max(0, phone.length - 4))}${last4}`
    : `***${last4}`;

  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    name: String(row.name),
    phoneMasked: masked,
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at),
    lastBookingAt: String(row.last_booking_at ?? row.created_at),
  };
}

export function mapBooking(row: Record<string, unknown>) {
  const source = (row.source === "manual" ? "manual" : "public_page") as
    | "manual"
    | "public_page";

  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    clientId: String(row.client_id),
    serviceId: String(row.service_id),
    status: String(row.status) as
      | "confirmed"
      | "cancelled_by_client"
      | "cancelled_by_master",
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    source,
    clientNote: String(row.client_note ?? ""),
    cancellationToken: String(row.cancellation_token ?? ""),
    cancellationTokenExpiresAt: String(row.cancellation_token_expires_at ?? ""),
    createdAt: String(row.created_at),
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
  };
}

export function mapAvailabilityRule(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    weekday: Number(row.weekday),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    isActive: Boolean(row.is_active),
  };
}

export function mapBlockedSlot(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    reason: String(row.reason ?? ""),
  };
}

export function mapGiftCertificate(row: Record<string, unknown>) {
  const status = String(row.status ?? "pending");

  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    code: String(row.code),
    amount: Number(row.amount),
    serviceId: row.service_id ? String(row.service_id) : null,
    status: (["pending", "paid", "active", "redeemed", "expired", "canceled"].includes(status)
      ? status
      : "pending") as
      | "pending"
      | "paid"
      | "active"
      | "redeemed"
      | "expired"
      | "canceled",
    purchaserContact: String(row.purchaser_contact ?? ""),
    provider: String(row.provider ?? "yookassa"),
    providerPaymentId: row.provider_payment_id ? String(row.provider_payment_id) : null,
    redeemedAt: row.redeemed_at ? String(row.redeemed_at) : null,
    redeemedBookingId: row.redeemed_booking_id ? String(row.redeemed_booking_id) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export type MappedNotificationEvent = {
  id: string;
  profileId: string;
  type:
    | "sms_confirmation"
    | "sms_reminder_client"
    | "telegram_reminder_master"
    | "telegram_new_booking"
    | "sms_certificate_code";
  status: "sent" | "failed" | "processing" | "cancelled" | "queued";
  target: string;
  createdAt: string;
};

export function mapNotificationEvent(row: Record<string, unknown>): MappedNotificationEvent {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    type:
      row.type === "sms_confirmation"
        ? "sms_confirmation"
        : row.type === "sms_reminder_client"
          ? "sms_reminder_client"
          : row.type === "telegram_reminder_master"
            ? "telegram_reminder_master"
            : row.type === "sms_certificate_code"
              ? "sms_certificate_code"
              : "telegram_new_booking",
    status:
      row.status === "sent"
        ? "sent"
        : row.status === "failed"
          ? "failed"
          : row.status === "processing"
            ? "processing"
            : row.status === "cancelled"
              ? "cancelled"
              : "queued",
    target: String(row.target),
    createdAt: String(row.created_at),
  };
}
