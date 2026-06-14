import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import {
  decryptPhone,
  encryptPhone,
  getBusyUntilIso,
  getCancellationDeadlineIso,
  hashPhone,
  humanizeBookingDate,
  isValidPhoneNumber,
  normalizePhoneDigits,
  phoneLast4,
  toUtcIsoFromLocalSlot,
} from "@/lib/booking";
import { saveMockBookingConfirmation } from "@/lib/mock-booking-confirmations";
import { checkBookingConflict } from "@/lib/booking-conflicts";
import {
  buildReminderNotificationEvents,
  processNotificationQueue,
} from "@/lib/notification-queue";
import {
  acquireBookingIdempotency,
  assertPublicBookingRateLimit,
  buildBookingRequestHash,
  buildIdempotencyKey,
  completeBookingIdempotency,
  failBookingIdempotency,
} from "@/lib/public-booking-guards";
import {
  isSupabaseBookingOverlapError,
  isSupabaseMissingColumnError,
} from "@/lib/supabase/auth-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { profile as mockProfile, services as mockServices } from "@/lib/mock-data";

const bookingSchema = z.object({
  username: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,30}$/),
  serviceId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  name: z.string().min(2),
  phone: z.string().refine(isValidPhoneNumber),
  note: z.string().optional().default(""),
});

export async function POST(request: Request) {
  const parsed = bookingSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверь поля записи." }, { status: 400 });
  }

  if (!isSupabaseConfigured) {
    const mockService = mockServices.find((service) => service.id === parsed.data.serviceId);
    const startsAtIso = toUtcIsoFromLocalSlot({
      date: parsed.data.date,
      time: parsed.data.time,
      timezone: mockProfile.timezone,
    });
    const confirmation = saveMockBookingConfirmation({
      username: parsed.data.username,
      clientName: parsed.data.name,
      serviceTitle: mockService?.title ?? "Запись",
      startsAtIso: startsAtIso ?? new Date().toISOString(),
      cancellationToken: `mock-cancel-${randomUUID().replace(/-/g, "")}`,
    });

    return NextResponse.json({
      ok: true,
      bookingId: confirmation.id,
      redirectUrl: `/${parsed.data.username}/confirm?bookingId=${confirmation.id}&cancelToken=${confirmation.cancellationToken}`,
    });
  }

  const admin = createSupabaseAdminClient();
  const normalizedPhone = normalizePhoneDigits(parsed.data.phone);
  const storedPhone = normalizedPhone || parsed.data.phone;
  const requestHash = buildBookingRequestHash({
    username: parsed.data.username,
    serviceId: parsed.data.serviceId,
    date: parsed.data.date,
    time: parsed.data.time,
    name: parsed.data.name,
    phone: storedPhone,
    note: parsed.data.note ?? "",
  });
  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("username", parsed.data.username)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: "Не получилось связаться с базой мастера." },
      { status: 500 },
    );
  }

  if (!profileRow) {
    return NextResponse.json({ error: "Мастер не найден." }, { status: 404 });
  }

  if (String(profileRow.account_status ?? "active") === "disabled") {
    return NextResponse.json(
      { error: "Мастер сейчас не принимает записи через эту страницу." },
      { status: 404 },
    );
  }

  try {
    const rateLimitResult = await assertPublicBookingRateLimit({
      admin,
      profileId: String(profileRow.id),
      username: parsed.data.username,
      request,
    });

    if (!rateLimitResult.ok) {
      return NextResponse.json({ error: rateLimitResult.message }, { status: 429 });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось проверить лимит попыток записи.",
      },
      { status: 500 },
    );
  }

  const idempotencyKey = buildIdempotencyKey({
    request,
    requestHash,
  });
  let idempotencyRowId: string | null = null;

  try {
    const idempotencyState = await acquireBookingIdempotency({
      admin,
      profileId: String(profileRow.id),
      idempotencyKey,
      requestHash,
    });

    if (idempotencyState.kind === "mismatch") {
      return NextResponse.json(
        { error: "Эта форма уже была отправлена с другими данными. Обнови страницу и попробуй снова." },
        { status: 409 },
      );
    }

    if (idempotencyState.kind === "processing") {
      return NextResponse.json(
        { error: "Эта запись уже обрабатывается. Подожди пару секунд." },
        { status: 409 },
      );
    }

    if (idempotencyState.kind === "replay") {
      return NextResponse.json(idempotencyState.payload, {
        status: 200,
        headers: {
          "X-Idempotent-Replay": "true",
        },
      });
    }

    idempotencyRowId = idempotencyState.rowId;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось зафиксировать запрос записи.",
      },
      { status: 500 },
    );
  }

  const respondWithError = async (status: number, message: string) => {
    if (idempotencyRowId) {
      await failBookingIdempotency({
        admin,
        rowId: idempotencyRowId,
        payload: { ok: false, error: message },
      });
    }

    return NextResponse.json({ error: message }, { status });
  };

  const { data: serviceRow, error: serviceError } = await admin
    .from("services")
    .select("*")
    .eq("id", parsed.data.serviceId)
    .eq("profile_id", profileRow.id)
    .maybeSingle();

  if (serviceError) {
    return respondWithError(500, "Не получилось загрузить выбранную услугу.");
  }

  if (!serviceRow) {
    return respondWithError(404, "Услуга не найдена.");
  }

  const startsAtIso = toUtcIsoFromLocalSlot({
    date: parsed.data.date,
    time: parsed.data.time,
    timezone: String(profileRow.timezone ?? "Europe/Simferopol"),
  });

  if (!startsAtIso) {
    return respondWithError(400, "Дата записи не распознана.");
  }

  const startsAt = new Date(startsAtIso);
  const endsAt = new Date(
    startsAt.getTime() + Number(serviceRow.duration_minutes) * 60_000,
  );
  const bufferMinutes = Number(profileRow.buffer_minutes ?? 0);
  const slotBusyEnd = new Date(endsAt.getTime() + bufferMinutes * 60_000);

  const { hasConflict, error: collisionError } = await checkBookingConflict({
    client: admin,
    profileId: String(profileRow.id),
    candidateStartIso: startsAt.toISOString(),
    candidateBusyEndIso: slotBusyEnd.toISOString(),
    bufferMinutes,
  });

  if (collisionError) {
    logError("Failed to check booking conflict", {
      profileId: String(profileRow.id),
      serviceId: String(serviceRow.id),
      error: collisionError,
    });
    return respondWithError(500, "Не получилось проверить свободное время.");
  }

  if (hasConflict) {
    return respondWithError(409, "Это время уже занято. Выбери другой слот.");
  }

  const encryptedPhone = encryptPhone(storedPhone);
  const phoneHash = hashPhone(storedPhone);
  let clientRow: { id: string } | null = null;
  let supportsPhoneHash = true;

  const existingClientLookup = await admin
    .from("clients")
    .select("id")
    .eq("profile_id", profileRow.id)
    .eq("phone_hash", phoneHash)
    .maybeSingle();

  if (existingClientLookup.error) {
    if (isSupabaseMissingColumnError(existingClientLookup.error, "phone_hash")) {
      supportsPhoneHash = false;
    } else {
      return respondWithError(500, "Не получилось найти клиента в базе.");
    }
  }

  let resolvedClient = supportsPhoneHash ? existingClientLookup.data : null;

  if (!resolvedClient) {
    let legacyClientsQuery = admin
      .from("clients")
      .select(supportsPhoneHash ? "id, phone_encrypted, phone_hash" : "id, phone_encrypted")
      .eq("profile_id", profileRow.id);

    if (supportsPhoneHash) {
      legacyClientsQuery = legacyClientsQuery.is("phone_hash", null);
    }

    const { data: legacyClients, error: legacyClientError } = await legacyClientsQuery;

    if (legacyClientError) {
      return respondWithError(500, "Не получилось найти клиента в базе.");
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
      resolvedClient = { id: String(matchedLegacyClient.id) };
    }
  }

  if (resolvedClient) {
    const clientUpdatePayload = {
      name: parsed.data.name,
      phone_encrypted: encryptedPhone,
      last_booking_at: startsAt.toISOString(),
      ...(supportsPhoneHash ? { phone_hash: phoneHash } : {}),
    };
    const { data: updatedClient, error: updateClientError } = await admin
      .from("clients")
      .update(clientUpdatePayload)
      .eq("id", resolvedClient.id)
      .select("id")
      .single();

    if (updateClientError || !updatedClient) {
      return respondWithError(500, "Не получилось обновить данные клиента.");
    }

    clientRow = updatedClient;
  } else {
    const clientInsertPayload = {
      profile_id: profileRow.id,
      name: parsed.data.name,
      phone_encrypted: encryptedPhone,
      phone_last4: phoneLast4(storedPhone),
      notes: "",
      last_booking_at: startsAt.toISOString(),
      ...(supportsPhoneHash ? { phone_hash: phoneHash } : {}),
    };
    const { data: insertedClient, error: insertClientError } = await admin
      .from("clients")
      .insert(clientInsertPayload)
      .select("id")
      .single();

    if (insertClientError || !insertedClient) {
      return respondWithError(500, "Не получилось сохранить клиента.");
    }

    clientRow = insertedClient;
  }

  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .insert({
      profile_id: profileRow.id,
      client_id: clientRow.id,
      service_id: serviceRow.id,
      status: "confirmed",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      busy_until:
        getBusyUntilIso({
          endsAtIso: endsAt.toISOString(),
          bufferMinutes,
        }) ?? slotBusyEnd.toISOString(),
      source: "public_page",
      client_note: parsed.data.note,
      cancellation_token_expires_at:
        getCancellationDeadlineIso({
          startsAtIso: startsAt.toISOString(),
          cancellationNoticeHours: Number(profileRow.cancellation_notice_hours ?? 0),
        }) ?? startsAt.toISOString(),
    })
    .select("*")
    .single();

  if (bookingError || !bookingRow) {
    if (isSupabaseBookingOverlapError(bookingError)) {
      return respondWithError(409, "Это время уже занято. Выбери другой слот.");
    }

    return respondWithError(500, "Не получилось создать запись.");
  }

  const startsAtLabel = humanizeBookingDate({
    startsAtIso: startsAt.toISOString(),
    timezone: String(profileRow.timezone ?? "Europe/Simferopol"),
  });

  const telegramChatId = profileRow.telegram_chat_id
    ? String(profileRow.telegram_chat_id)
    : null;

  const notificationEventsToInsert = [
    {
      profile_id: profileRow.id,
      booking_id: bookingRow.id,
      type: "sms_confirmation",
      status: "queued",
      target: storedPhone,
      payload: {
        phone: parsed.data.phone,
        masterName: String(profileRow.full_name),
        serviceTitle: String(serviceRow.title),
        startsAtLabel,
      },
    },
    ...(telegramChatId
      ? [
          {
            profile_id: profileRow.id,
            booking_id: bookingRow.id,
            type: "telegram_new_booking",
            status: "queued",
            target: telegramChatId,
            payload: {
              chatId: telegramChatId,
              clientName: parsed.data.name,
              serviceTitle: String(serviceRow.title),
              startsAtLabel,
            },
          },
        ]
      : []),
  ];

  const { data: notificationRows, error: notificationQueueError } = await admin
    .from("notification_events")
    .insert(notificationEventsToInsert)
    .select("id");

  const reminderRows = buildReminderNotificationEvents({
    profile: {
      id: String(profileRow.id),
      fullName: String(profileRow.full_name),
      timezone: String(profileRow.timezone ?? "Europe/Simferopol"),
      telegramChatId: profileRow.telegram_chat_id ? String(profileRow.telegram_chat_id) : null,
      clientReminderHours: Number(profileRow.client_reminder_hours ?? 24),
      masterReminderHours: Number(profileRow.master_reminder_hours ?? 2),
    },
    bookingId: String(bookingRow.id),
    phone: storedPhone,
    clientName: parsed.data.name,
    serviceTitle: String(serviceRow.title),
    startsAtIso: startsAt.toISOString(),
  });

  if (reminderRows.length > 0) {
    const { error: reminderInsertError } = await admin
      .from("notification_events")
      .insert(reminderRows);

    if (reminderInsertError) {
      logError("Failed to enqueue reminder jobs", {
        bookingId: String(bookingRow.id),
        error: reminderInsertError,
      });
    }
  }

  const responsePayload = {
    ok: true,
    bookingId: bookingRow.id,
    redirectUrl: `/${parsed.data.username}/confirm?bookingId=${bookingRow.id}&cancelToken=${bookingRow.cancellation_token}`,
  };

  if (idempotencyRowId) {
    await completeBookingIdempotency({
      admin,
      rowId: idempotencyRowId,
      bookingId: String(bookingRow.id),
      payload: responsePayload,
    });
  }

  await writeAuditLog({
    actorKind: "client",
    profileId: String(profileRow.id),
    workspaceId: String(profileRow.workspace_id ?? profileRow.id),
    eventType: "booking.public.created",
    targetType: "booking",
    targetId: String(bookingRow.id),
    metadata: {
      serviceId: String(serviceRow.id),
      startsAtIso: startsAt.toISOString(),
      source: "public_page",
    },
  });

  if (!notificationQueueError) {
    const eventIds = (notificationRows ?? []).map((row) => String(row.id));
    after(async () => {
      await processNotificationQueue(eventIds);
    });
  } else {
    logError("Failed to enqueue notification jobs", {
      bookingId: String(bookingRow.id),
      error: notificationQueueError,
    });
  }

  return NextResponse.json(responsePayload);
}
