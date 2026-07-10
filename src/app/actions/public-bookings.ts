"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { z } from "zod";
import {
  decryptPhone,
  getBusyUntilIso,
  getCancellationDeadlineIso,
  isSameLocalSlot,
} from "@/lib/booking";
import { checkBookingConflict } from "@/lib/booking-conflicts";
import { suggestCancelVisitStatus } from "@/lib/client-reliability";
import { bookings as mockBookings, profile as mockProfile } from "@/lib/mock-data";
import { getBookingCancellationData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import {
  buildReminderNotificationEvents,
  buildRepeatVisitReminderEvent,
  cancelQueuedReminderEvents,
} from "@/lib/notification-queue";
import {
  isSupabaseBookingOverlapError,
  isSupabaseMissingColumnError,
} from "@/lib/supabase/auth-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PublicBookingActionState = {
  success: boolean;
  message: string;
};

const initialState: PublicBookingActionState = {
  success: false,
  message: "",
};

export { initialState as initialPublicBookingActionState };

const cancellationSchema = z.object({
  cancellationToken: z.string().min(1),
});

const rescheduleSchema = z.object({
  cancellationToken: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
});

export async function cancelBookingByTokenAction(
  _prevState: PublicBookingActionState,
  formData: FormData,
) {
  const parsed = cancellationSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: "Ссылка отмены повреждена или неполная." };
  }

  const cancellationData = await getBookingCancellationData(parsed.data.cancellationToken);
  if (!cancellationData) {
    return { success: false, message: "Запись по этой ссылке не найдена." };
  }

  if (cancellationData.status !== "confirmed") {
    return { success: false, message: "Эта запись уже отменена и больше не активна." };
  }

  if (!cancellationData.canCancel) {
    return {
      success: false,
      message: "Срок самостоятельной отмены уже прошел. Лучше свяжись с мастером напрямую.",
    };
  }

  const cancelledAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const booking = mockBookings.find(
      (item) => item.cancellationToken === parsed.data.cancellationToken,
    );

    if (!booking || booking.status !== "confirmed") {
      return { success: false, message: "Эта запись уже не активна." };
    }

    booking.status = "cancelled_by_client";
    booking.cancelledAt = cancelledAt;
    // Рейтинг надёжности (Модуль 1, okno-tz-rating-prepayment.md): статус
    // визита при самостоятельной отмене клиентом фиксируем сразу, по факту
    // времени отмены — так cancelled_late/cancelled_ok попадают в рейтинг,
    // даже если мастер сам никогда не откроет эту запись в архиве.
    booking.visitStatus = suggestCancelVisitStatus({
      startsAtIso: booking.startsAt,
      cancelledAtIso: cancelledAt,
      timezone: mockProfile.timezone,
      lateCancelThresholdHours: mockProfile.lateCancelThresholdHours,
    });
    booking.visitStatusSetAt = cancelledAt;

    revalidatePath(`/${mockProfile.username}`);
    revalidatePath(`/${mockProfile.username}/book`);
    revalidatePath(`/${mockProfile.username}/confirm`);
    revalidatePath("/dashboard");
    revalidatePath("/schedule");
    revalidatePath("/clients");
    revalidatePath(`/cancel/${parsed.data.cancellationToken}`);

    return {
      success: true,
      message: "Запись отменена. Слот снова станет доступен клиентам.",
    };
  }

  const admin = createSupabaseAdminClient();
  // Рейтинг надёжности (Модуль 1, okno-tz-rating-prepayment.md): фиксируем
  // visit_status сразу по факту времени отмены, чтобы cancelled_late/
  // cancelled_ok попадали в client_reliability даже без похода мастера в архив.
  const visitStatus = suggestCancelVisitStatus({
    startsAtIso: cancellationData.startsAtIso,
    cancelledAtIso: cancelledAt,
    timezone: cancellationData.timezone,
    lateCancelThresholdHours: cancellationData.lateCancelThresholdHours,
  });
  let { data: updatedBooking, error } = await admin
    .from("bookings")
    .update({
      status: "cancelled_by_client",
      cancelled_at: cancelledAt,
      visit_status: visitStatus,
      visit_status_set_at: cancelledAt,
    })
    .eq("cancellation_token", parsed.data.cancellationToken)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  // Колонка visit_status еще может не быть (миграция 202607090001 не
  // прогнана) — отменяем запись без неё, чтобы клиентская отмена не падала.
  if (error && isSupabaseMissingColumnError(error, "visit_status")) {
    const retry = await admin
      .from("bookings")
      .update({
        status: "cancelled_by_client",
        cancelled_at: cancelledAt,
      })
      .eq("cancellation_token", parsed.data.cancellationToken)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle();

    updatedBooking = retry.data;
    error = retry.error;
  }

  if (error) {
    return { success: false, message: "Не получилось отменить запись." };
  }

  if (!updatedBooking) {
    return { success: false, message: "Эта запись уже не активна." };
  }

  await cancelQueuedReminderEvents(String(updatedBooking.id));

  await writeAuditLog({
    actorKind: "client",
    profileId: cancellationData.profileId,
    workspaceId: cancellationData.workspaceId,
    eventType: "booking.cancelled_by_client",
    targetType: "booking",
    targetId: String(updatedBooking.id),
    metadata: {
      via: "protected_link",
    },
  });

  revalidatePath(`/${cancellationData.username}`);
  revalidatePath(`/${cancellationData.username}/book`);
  revalidatePath(`/${cancellationData.username}/confirm`);
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
  revalidatePath("/clients");
  revalidatePath(`/cancel/${parsed.data.cancellationToken}`);

  return {
    success: true,
    message: "Запись отменена. Слот снова станет доступен клиентам.",
  };
}

export async function rescheduleBookingByTokenAction(
  _prevState: PublicBookingActionState,
  formData: FormData,
) {
  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: "Выбери новую дату и время для переноса." };
  }

  const bookingData = await getBookingCancellationData(parsed.data.cancellationToken);
  if (!bookingData) {
    return { success: false, message: "Запись по этой ссылке не найдена." };
  }

  if (bookingData.status !== "confirmed") {
    return { success: false, message: "Эта запись уже не активна." };
  }

  if (!bookingData.canCancel) {
    return {
      success: false,
      message: "Срок самостоятельного переноса уже прошел. Лучше свяжись с мастером напрямую.",
    };
  }

  const selectedSlot = bookingData.bookingSlots.find((slot) => slot.value === parsed.data.date);
  if (!selectedSlot || !selectedSlot.times.includes(parsed.data.time)) {
    return {
      success: false,
      message: "Выбранное время уже устарело. Обнови страницу и попробуй снова.",
    };
  }

  if (
    isSameLocalSlot({
      startsAtIso: bookingData.startsAtIso,
      timezone: bookingData.timezone,
      date: parsed.data.date,
      time: parsed.data.time,
    })
  ) {
    return {
      success: false,
      message: "Это то же самое время. Выбери другой слот для переноса.",
    };
  }

  if (!isSupabaseConfigured) {
    const booking = mockBookings.find(
      (item) => item.cancellationToken === parsed.data.cancellationToken,
    );

    if (!booking) {
      return { success: false, message: "Запись не найдена." };
    }

    const nextStart = DateTime.fromISO(`${parsed.data.date}T${parsed.data.time}`, {
      zone: mockProfile.timezone,
    });

    if (!nextStart.isValid) {
      return { success: false, message: "Не получилось распознать новое время." };
    }

    booking.startsAt = nextStart.toUTC().toISO() ?? booking.startsAt;
    booking.endsAt =
      nextStart.plus({ minutes: bookingData.serviceDurationMinutes }).toUTC().toISO() ??
      booking.endsAt;
    booking.cancellationTokenExpiresAt =
      getCancellationDeadlineIso({
        startsAtIso: booking.startsAt,
        cancellationNoticeHours: mockProfile.cancellationNoticeHours,
      }) ?? booking.cancellationTokenExpiresAt;

    revalidatePath(`/${bookingData.username}`);
    revalidatePath(`/${bookingData.username}/book`);
    revalidatePath(`/${bookingData.username}/confirm`);
    revalidatePath("/dashboard");
    revalidatePath("/schedule");
    revalidatePath("/clients");
    revalidatePath(`/cancel/${parsed.data.cancellationToken}`);

    redirect(`/cancel/${parsed.data.cancellationToken}?updated=1`);
  }

  const admin = createSupabaseAdminClient();
  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select("id, profile_id, service_id, client_id, starts_at, repeat_visit_reminder_requested")
    .eq("cancellation_token", parsed.data.cancellationToken)
    .eq("status", "confirmed")
    .maybeSingle();

  if (bookingError) {
    return { success: false, message: "Не получилось загрузить запись для переноса." };
  }

  if (!bookingRow) {
    return { success: false, message: "Эта запись уже не активна." };
  }

  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("timezone, buffer_minutes, cancellation_notice_hours, username, telegram_chat_id, full_name, client_reminder_hours, master_reminder_hours")
    .eq("id", bookingRow.profile_id)
    .maybeSingle();

  if (profileError || !profileRow) {
    return { success: false, message: "Не получилось загрузить профиль мастера." };
  }

  const { data: serviceRow, error: serviceError } = await admin
    .from("services")
    .select("title, duration_minutes, repeat_interval_weeks")
    .eq("id", bookingRow.service_id)
    .maybeSingle();

  if (serviceError || !serviceRow) {
    return { success: false, message: "Не получилось загрузить услугу для переноса." };
  }

  const { data: clientRow, error: clientError } = await admin
    .from("clients")
    .select("phone_encrypted")
    .eq("id", bookingRow.client_id)
    .maybeSingle();

  if (clientError || !clientRow) {
    return { success: false, message: "Не получилось загрузить клиента для переноса." };
  }

  const nextStart = DateTime.fromISO(`${parsed.data.date}T${parsed.data.time}`, {
    zone: String(profileRow.timezone ?? "Europe/Simferopol"),
  });

  if (!nextStart.isValid) {
    return { success: false, message: "Не получилось распознать новое время." };
  }

  const nextStartIso = nextStart.toUTC().toISO();
  const nextEndIso = nextStart
    .plus({ minutes: Number(serviceRow.duration_minutes) })
    .toUTC()
    .toISO();

  if (!nextStartIso || !nextEndIso) {
    return { success: false, message: "Не получилось собрать новый слот." };
  }

  if (
    isSameLocalSlot({
      startsAtIso: String(bookingRow.starts_at),
      timezone: String(profileRow.timezone ?? "Europe/Simferopol"),
      date: parsed.data.date,
      time: parsed.data.time,
    })
  ) {
    return {
      success: false,
      message: "Это то же самое время. Выбери другой слот для переноса.",
    };
  }

  const slotBusyEndIso =
    DateTime.fromISO(nextEndIso, { zone: "utc" })
      .plus({ minutes: Number(profileRow.buffer_minutes ?? 0) })
      .toISO() ?? nextEndIso;

  const { hasConflict, error: conflictError } = await checkBookingConflict({
    client: admin,
    profileId: String(bookingRow.profile_id),
    candidateStartIso: nextStartIso,
    candidateBusyEndIso: slotBusyEndIso,
    bufferMinutes: Number(profileRow.buffer_minutes ?? 0),
    excludeBookingId: String(bookingRow.id),
  });

  if (conflictError) {
    logError("Failed to check reschedule conflict", {
      bookingId: String(bookingRow.id),
      profileId: String(bookingRow.profile_id),
      error: conflictError,
    });
    return { success: false, message: "Не получилось проверить новое время." };
  }

  if (hasConflict) {
    return {
      success: false,
      message: "Это время уже занято. Выбери другой слот.",
    };
  }

  const { error: updateError } = await admin
    .from("bookings")
    .update({
      starts_at: nextStartIso,
      ends_at: nextEndIso,
      busy_until:
        getBusyUntilIso({
          endsAtIso: nextEndIso,
          bufferMinutes: Number(profileRow.buffer_minutes ?? 0),
        }) ?? slotBusyEndIso,
      cancellation_token_expires_at:
        getCancellationDeadlineIso({
          startsAtIso: nextStartIso,
          cancellationNoticeHours: Number(profileRow.cancellation_notice_hours ?? 0),
        }) ?? nextStartIso,
    })
    .eq("id", bookingRow.id)
    .eq("cancellation_token", parsed.data.cancellationToken)
    .eq("status", "confirmed");

  if (updateError) {
    if (isSupabaseBookingOverlapError(updateError)) {
      return { success: false, message: "Это время уже занято. Выбери другой слот." };
    }

    return { success: false, message: "Не получилось перенести запись." };
  }

  await cancelQueuedReminderEvents(String(bookingRow.id));

  const reminderRows = buildReminderNotificationEvents({
    profile: {
      id: String(bookingRow.profile_id),
      fullName: String(profileRow.full_name ?? bookingData.masterName),
      timezone: String(profileRow.timezone ?? "Europe/Simferopol"),
      telegramChatId: profileRow.telegram_chat_id ? String(profileRow.telegram_chat_id) : null,
      clientReminderHours: Number(profileRow.client_reminder_hours ?? 24),
      masterReminderHours: Number(profileRow.master_reminder_hours ?? 2),
    },
    bookingId: String(bookingRow.id),
    phone: decryptPhone(String(clientRow.phone_encrypted ?? "")),
    clientName: bookingData.clientName,
    serviceTitle: String(serviceRow.title ?? bookingData.serviceTitle),
    startsAtIso: nextStartIso,
  });

  if (reminderRows.length > 0) {
    await admin.from("notification_events").insert(reminderRows);
  }

  if (bookingRow.repeat_visit_reminder_requested) {
    const repeatVisitRow = buildRepeatVisitReminderEvent({
      profileId: String(bookingRow.profile_id),
      bookingId: String(bookingRow.id),
      phone: decryptPhone(String(clientRow.phone_encrypted ?? "")),
      masterName: String(profileRow.full_name ?? bookingData.masterName),
      serviceTitle: String(serviceRow.title ?? bookingData.serviceTitle),
      startsAtIso: nextStartIso,
      repeatIntervalWeeks: Number(serviceRow.repeat_interval_weeks ?? 0),
    });

    if (repeatVisitRow) {
      await admin.from("notification_events").insert(repeatVisitRow);
    }
  }

  await writeAuditLog({
    actorKind: "client",
    profileId: String(bookingRow.profile_id),
    workspaceId: bookingData.workspaceId,
    eventType: "booking.rescheduled_by_client",
    targetType: "booking",
    targetId: String(bookingRow.id),
    metadata: {
      startsAtIso: nextStartIso,
      via: "protected_link",
    },
  });

  revalidatePath(`/${String(profileRow.username)}`);
  revalidatePath(`/${String(profileRow.username)}/book`);
  revalidatePath(`/${String(profileRow.username)}/confirm`);
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
  revalidatePath("/clients");
  revalidatePath(`/cancel/${parsed.data.cancellationToken}`);

  redirect(`/cancel/${parsed.data.cancellationToken}?updated=1`);
}
