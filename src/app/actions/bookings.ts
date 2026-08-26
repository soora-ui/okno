"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";
import {
  decryptPhone,
  encryptPhone,
  getBusyUntilIso,
  getCancellationDeadlineIso,
  hashPhone,
  isValidPhoneNumber,
  normalizePhoneDigits,
  phoneLast4,
} from "@/lib/booking";
import { checkBookingConflict } from "@/lib/booking-conflicts";
import type { VisitStatus } from "@/lib/client-reliability";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import {
  buildReminderNotificationEvents,
  buildClientCancelledNotificationEvent,
  cancelQueuedReminderEvents,
} from "@/lib/notification-queue";
import {
  blockedSlots as mockBlockedSlots,
  bookings as mockBookings,
  clients as mockClients,
  services as mockServices,
} from "@/lib/mock-data";
import {
  isSupabaseBookingOverlapError,
  isSupabaseMissingColumnError,
} from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BookingOperationActionState = {
  success: boolean;
  message: string;
};

const manualBookingSchema = z.object({
  serviceId: z.string().min(1),
  name: z.string().trim().min(2),
  phone: z.string().trim().refine(isValidPhoneNumber),
  date: z.string().min(1),
  time: z.string().min(1),
  note: z.string().trim().default(""),
});

// В Supabase идентификаторы — UUID; в демо-режиме mock-данные используют
// строковые id вида "booking-1", поэтому там оставляем свободный формат.
const entityIdSchema = isSupabaseConfigured
  ? z.string().uuid()
  : z.string().min(1);

const bookingIdSchema = z.object({
  bookingId: entityIdSchema,
});

const clientNotesSchema = z.object({
  clientId: entityIdSchema,
  notes: z.string().trim().default(""),
});

const visitStatusValues = [
  "completed",
  "no_show",
  "cancelled_late",
  "cancelled_ok",
] as const satisfies readonly VisitStatus[];

const visitStatusSchema = z.object({
  bookingId: entityIdSchema,
  visitStatus: z.enum(visitStatusValues),
});

async function requireProfile() {
  const authProfile = await getCurrentAuthProfile();

  return authProfile?.profile ?? null;
}

function revalidateBookingPaths(username: string) {
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
  revalidatePath("/clients");
  revalidatePath(`/${username}`);
  revalidatePath(`/${username}/book`);
}

function getAuditProfileContext(profile: NonNullable<Awaited<ReturnType<typeof requireProfile>>>) {
  return {
    actorKind: "master" as const,
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
  };
}

function formatMockPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const last4 = phoneLast4(digits);

  return last4 ? `***${last4}` : phone;
}

function hasMockConflict(input: {
  profileId: string;
  startsAtIso: string;
  endsAtIso: string;
  bufferMinutes: number;
}) {
  const candidateStart = DateTime.fromISO(input.startsAtIso, { zone: "utc" });
  const candidateBusyEnd = DateTime.fromISO(input.endsAtIso, { zone: "utc" }).plus({
    minutes: input.bufferMinutes,
  });

  const bookingConflict = mockBookings.some((booking) => {
    if (booking.profileId !== input.profileId || booking.status !== "confirmed") {
      return false;
    }

    const bookingStart = DateTime.fromISO(booking.startsAt, { zone: "utc" });
    const bookingBusyEnd = DateTime.fromISO(booking.endsAt, { zone: "utc" }).plus({
      minutes: input.bufferMinutes,
    });

    return candidateStart < bookingBusyEnd && candidateBusyEnd > bookingStart;
  });

  const blockedConflict = mockBlockedSlots.some((blockedSlot) => {
    if (blockedSlot.profileId !== input.profileId) {
      return false;
    }

    const blockedStart = DateTime.fromISO(blockedSlot.startsAt, { zone: "utc" });
    const blockedEnd = DateTime.fromISO(blockedSlot.endsAt, { zone: "utc" });

    return candidateStart < blockedEnd && candidateBusyEnd > blockedStart;
  });

  return bookingConflict || blockedConflict;
}

export async function createManualBookingAction(
  _prevState: BookingOperationActionState,
  formData: FormData,
) {
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = manualBookingSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: "Проверь имя клиента, телефон, услугу и время записи.",
    };
  }

  const startsAt = DateTime.fromISO(
    `${parsed.data.date}T${parsed.data.time}`,
    { zone: profile.timezone },
  );

  if (!startsAt.isValid) {
    return {
      success: false,
      message: "Не получилось распознать дату и время записи.",
    };
  }

  if (startsAt <= DateTime.now().setZone(profile.timezone)) {
    return {
      success: false,
      message: "Ручную запись стоит ставить на будущее время.",
    };
  }

  if (!isSupabaseConfigured) {
    const service = mockServices.find((item) => item.id === parsed.data.serviceId);

    if (!service) {
      return { success: false, message: "Услуга не найдена." };
    }

    const startsAtIso = startsAt.toUTC().toISO();
    const endsAtIso = startsAt
      .plus({ minutes: service.durationMinutes })
      .toUTC()
      .toISO();

    if (!startsAtIso || !endsAtIso) {
      return { success: false, message: "Не получилось сохранить время записи." };
    }

    if (
      hasMockConflict({
        profileId: profile.id,
        startsAtIso,
        endsAtIso,
        bufferMinutes: profile.bufferMinutes,
      })
    ) {
      return { success: false, message: "Это время уже занято." };
    }

    const normalizedPhone = parsed.data.phone.replace(/\D/g, "");
    const existingClient = mockClients.find(
      (client) =>
        client.profileId === profile.id &&
        client.phoneMasked.endsWith(phoneLast4(normalizedPhone)),
    );
    const clientId = existingClient?.id ?? randomUUID();

    if (existingClient) {
      existingClient.name = parsed.data.name;
      existingClient.lastBookingAt = startsAtIso;
    } else {
      mockClients.unshift({
        id: clientId,
        profileId: profile.id,
        name: parsed.data.name,
        phoneMasked: formatMockPhone(parsed.data.phone),
        notes: "",
        createdAt: new Date().toISOString(),
        lastBookingAt: startsAtIso,
      });
    }

    mockBookings.unshift({
      id: randomUUID(),
      profileId: profile.id,
      clientId,
      serviceId: service.id,
      status: "confirmed",
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      source: "manual",
      clientNote: parsed.data.note,
      cancellationToken: randomUUID().replace(/-/g, ""),
      cancellationTokenExpiresAt:
        getCancellationDeadlineIso({
          startsAtIso,
          cancellationNoticeHours: profile.cancellationNoticeHours,
        }) ?? startsAtIso,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      visitStatus: "pending",
      visitStatusSetAt: null,
      prepaymentRequired: false,
    });

    revalidateBookingPaths(profile.username);

    return { success: true, message: "Запись добавлена в календарь." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: serviceRow, error: serviceError } = await supabase
    .from("services")
    .select("*")
    .eq("id", parsed.data.serviceId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (serviceError) {
    return { success: false, message: "Не получилось загрузить услугу." };
  }

  if (!serviceRow) {
    return { success: false, message: "Услуга не найдена." };
  }

  const startsAtIso = startsAt.toUTC().toISO();
  const endsAtIso = startsAt
    .plus({ minutes: Number(serviceRow.duration_minutes) })
    .toUTC()
    .toISO();

  if (!startsAtIso || !endsAtIso) {
    return { success: false, message: "Не получилось сохранить время записи." };
  }

  const slotBusyEndIso = DateTime.fromISO(endsAtIso, { zone: "utc" })
    .plus({ minutes: profile.bufferMinutes })
    .toISO() ?? endsAtIso;

  const { hasConflict, error: conflictError } = await checkBookingConflict({
    client: supabase,
    profileId: profile.id,
    candidateStartIso: startsAtIso,
    candidateBusyEndIso: slotBusyEndIso,
    bufferMinutes: profile.bufferMinutes,
  });

  if (conflictError) {
    logError("Failed to check manual booking conflict", {
      profileId: profile.id,
      serviceId: parsed.data.serviceId,
      error: conflictError,
    });
    return {
      success: false,
      message: "Не получилось проверить свободное время.",
    };
  }

  if (hasConflict) {
    return { success: false, message: "Это время уже занято." };
  }

  const normalizedPhone = normalizePhoneDigits(parsed.data.phone);
  const storedPhone = normalizedPhone || parsed.data.phone;
  const encryptedPhone = encryptPhone(storedPhone);
  const phoneHash = hashPhone(storedPhone);
  let supportsPhoneHash = true;

  let resolvedClientId: string | null = null;

  const existingClientLookup = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("phone_hash", phoneHash)
    .maybeSingle();

  if (existingClientLookup.error) {
    if (isSupabaseMissingColumnError(existingClientLookup.error, "phone_hash")) {
      supportsPhoneHash = false;
    } else {
      return { success: false, message: "Не получилось найти клиента." };
    }
  }

  if (supportsPhoneHash && existingClientLookup.data) {
    resolvedClientId = String(existingClientLookup.data.id);
  } else {
    let legacyClientsQuery = supabase
      .from("clients")
      .select(supportsPhoneHash ? "id, phone_encrypted, phone_hash" : "id, phone_encrypted")
      .eq("profile_id", profile.id);

    if (supportsPhoneHash) {
      legacyClientsQuery = legacyClientsQuery.is("phone_hash", null);
    }

    const { data: legacyClients, error: legacyClientsError } = await legacyClientsQuery;

    if (legacyClientsError) {
      return { success: false, message: "Не получилось найти клиента." };
    }

    const legacyClientRows = (legacyClients ?? []) as unknown as Array<{
      id: string;
      phone_encrypted?: string | null;
    }>;

    const matchedLegacyClient = legacyClientRows.find((client) => {
      const encryptedPhoneValue =
        typeof client.phone_encrypted === "string" ? client.phone_encrypted : "";

      return decryptPhone(encryptedPhoneValue) === storedPhone;
    });

    if (matchedLegacyClient) {
      resolvedClientId = String(matchedLegacyClient.id);
    }
  }

  if (resolvedClientId) {
    const clientUpdatePayload = {
      name: parsed.data.name,
      phone_encrypted: encryptedPhone,
      last_booking_at: startsAtIso,
      ...(supportsPhoneHash ? { phone_hash: phoneHash } : {}),
    };
    const { error: updateClientError } = await supabase
      .from("clients")
      .update(clientUpdatePayload)
      .eq("id", resolvedClientId)
      .eq("profile_id", profile.id);

    if (updateClientError) {
      return { success: false, message: "Не получилось обновить клиента." };
    }
  } else {
    const clientInsertPayload = {
      profile_id: profile.id,
      name: parsed.data.name,
      phone_encrypted: encryptedPhone,
      phone_last4: phoneLast4(storedPhone),
      notes: "",
      last_booking_at: startsAtIso,
      ...(supportsPhoneHash ? { phone_hash: phoneHash } : {}),
    };
    const { data: insertedClient, error: insertClientError } = await supabase
      .from("clients")
      .insert(clientInsertPayload)
      .select("id")
      .single();

    if (insertClientError || !insertedClient) {
      return { success: false, message: "Не получилось создать клиента." };
    }

    resolvedClientId = String(insertedClient.id);
  }

  const cancellationDeadlineIso =
    getCancellationDeadlineIso({
      startsAtIso,
      cancellationNoticeHours: profile.cancellationNoticeHours,
    }) ?? startsAtIso;

  const { data: insertedBooking, error: insertBookingError } = await supabase
    .from("bookings")
    .insert({
      profile_id: profile.id,
      client_id: resolvedClientId,
      service_id: String(serviceRow.id),
      status: "confirmed",
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      busy_until:
        getBusyUntilIso({
          endsAtIso,
          bufferMinutes: profile.bufferMinutes,
        }) ?? slotBusyEndIso,
      source: "manual",
      client_note: parsed.data.note,
      cancellation_token_expires_at: cancellationDeadlineIso,
    })
    .select("id")
    .single();

  if (insertBookingError || !insertedBooking) {
    if (isSupabaseBookingOverlapError(insertBookingError)) {
      return { success: false, message: "Это время уже занято." };
    }

    return { success: false, message: "Не получилось создать запись." };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "booking.manual.created",
    targetType: "booking",
    targetId: String(insertedBooking.id),
    metadata: {
      serviceId: String(serviceRow.id),
      startsAtIso,
      source: "manual",
    },
  });

  const reminderRows = buildReminderNotificationEvents({
    profile: {
      id: profile.id,
      fullName: profile.fullName,
      timezone: profile.timezone,
      telegramChatId: profile.telegramChatId,
      clientReminderHours: profile.clientReminderHours,
      masterReminderHours: profile.masterReminderHours,
    },
    bookingId: String(insertedBooking.id),
    phone: storedPhone,
    clientName: parsed.data.name,
    serviceTitle: String(serviceRow.title),
    startsAtIso,
  });

  if (reminderRows.length > 0) {
    await supabase.from("notification_events").insert(reminderRows);
  }

  revalidateBookingPaths(profile.username);

  return { success: true, message: "Запись добавлена в календарь." };
}

export async function cancelBookingByMasterAction(
  _prevState: BookingOperationActionState,
  formData: FormData,
) {
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = bookingIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: "Не удалось определить запись." };
  }

  const cancelledAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const booking = mockBookings.find(
      (item) => item.id === parsed.data.bookingId && item.profileId === profile.id,
    );

    if (!booking) {
      return { success: false, message: "Запись не найдена." };
    }

    if (booking.status !== "confirmed") {
      return { success: false, message: "Эта запись уже не активна." };
    }

    booking.status = "cancelled_by_master";
    booking.cancelledAt = cancelledAt;
    revalidateBookingPaths(profile.username);

    return { success: true, message: "Запись отменена." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: updatedBooking, error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled_by_master",
      cancelled_at: cancelledAt,
    })
    .eq("id", parsed.data.bookingId)
    .eq("profile_id", profile.id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  if (error) {
    logError("Failed to cancel booking by master", {
      profileId: profile.id,
      bookingId: parsed.data.bookingId,
      error,
    });
    return { success: false, message: "Не получилось отменить запись." };
  }

  if (!updatedBooking) {
    return { success: false, message: "Эта запись уже не активна." };
  }

  await cancelQueuedReminderEvents(parsed.data.bookingId);

  // Клиент мог сохранить визит в календарь и больше сюда не заходить —
  // об отмене он узнает только сообщением.
  await supabase.from("notification_events").insert(
    buildClientCancelledNotificationEvent({
      profileId: profile.id,
      bookingId: parsed.data.bookingId,
    }),
  );

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "booking.cancelled_by_master",
    targetType: "booking",
    targetId: parsed.data.bookingId,
  });

  revalidateBookingPaths(profile.username);

  return { success: true, message: "Запись отменена." };
}

export async function updateClientNotesAction(
  _prevState: BookingOperationActionState,
  formData: FormData,
) {
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = clientNotesSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: "Не удалось сохранить заметку." };
  }

  if (!isSupabaseConfigured) {
    const client = mockClients.find(
      (item) => item.id === parsed.data.clientId && item.profileId === profile.id,
    );

    if (!client) {
      return { success: false, message: "Клиент не найден." };
    }

    client.notes = parsed.data.notes;
    revalidatePath("/clients");
    revalidatePath("/dashboard");

    return { success: true, message: "Заметка сохранена." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clients")
    .update({ notes: parsed.data.notes })
    .eq("id", parsed.data.clientId)
    .eq("profile_id", profile.id);

  if (error) {
    return { success: false, message: "Не получилось сохранить заметку." };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");

  return { success: true, message: "Заметка сохранена." };
}

const visitStatusMessages: Record<(typeof visitStatusValues)[number], string> = {
  completed: "Отмечено: клиент пришёл.",
  no_show: "Отмечено: клиент не пришёл.",
  cancelled_late: "Отмечено: клиент отменил визит поздно.",
  cancelled_ok: "Отмечено: клиент отменил визит заранее.",
};

// Рейтинг надёжности клиента (Модуль 1 из okno-tz-rating-prepayment.md)
// фиксируется мастером вручную постфактум — эта отметка не меняет
// bookings.status (тот описывает жизненный цикл записи), а пишет отдельное
// поле visit_status, по которому считается client_reliability view.
export async function setVisitStatusAction(
  _prevState: BookingOperationActionState,
  formData: FormData,
) {
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = visitStatusSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: "Не удалось определить визит или статус." };
  }

  const visitStatusSetAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const booking = mockBookings.find(
      (item) => item.id === parsed.data.bookingId && item.profileId === profile.id,
    );

    if (!booking) {
      return { success: false, message: "Запись не найдена." };
    }

    booking.visitStatus = parsed.data.visitStatus;
    booking.visitStatusSetAt = visitStatusSetAt;
    revalidateBookingPaths(profile.username);
    revalidatePath("/archive");

    return { success: true, message: visitStatusMessages[parsed.data.visitStatus] };
  }

  const supabase = await createSupabaseServerClient();
  const { data: updatedBooking, error } = await supabase
    .from("bookings")
    .update({
      visit_status: parsed.data.visitStatus,
      visit_status_set_at: visitStatusSetAt,
    })
    .eq("id", parsed.data.bookingId)
    .eq("profile_id", profile.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isSupabaseMissingColumnError(error, "visit_status")) {
      return {
        success: false,
        message:
          "В базе еще нет поля отметки визита. Прогони миграцию 202607090001_client_reliability.sql и попробуй еще раз.",
      };
    }

    logError("Failed to set visit status", {
      profileId: profile.id,
      bookingId: parsed.data.bookingId,
      error,
    });
    return { success: false, message: "Не получилось отметить визит." };
  }

  if (!updatedBooking) {
    return { success: false, message: "Запись не найдена." };
  }

  await writeAuditLog({
    ...getAuditProfileContext(profile),
    eventType: "booking.visit_status.set",
    targetType: "booking",
    targetId: parsed.data.bookingId,
    metadata: { visitStatus: parsed.data.visitStatus },
  });

  revalidateBookingPaths(profile.username);
  revalidatePath("/archive");

  return { success: true, message: visitStatusMessages[parsed.data.visitStatus] };
}
