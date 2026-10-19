import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { env, isSupabaseConfigured } from "@/lib/env";
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
  isCertificateApplicableToService,
  isCertificateRedeemable,
  normalizeCertificateCodeInput,
} from "@/lib/gift-certificates";
import {
  buildReminderNotificationEvents,
  buildRepeatVisitReminderEvent,
  processNotificationQueue,
} from "@/lib/notification-queue";
import {
  isPhoneVerificationRequired,
  isPhoneVerificationTokenValid,
} from "@/lib/phone-verification";
import { createYooKassaPaymentWithToken, YooKassaAuthError } from "@/lib/payments/yookassa";
import {
  getActiveMasterYooKassaToken,
  markMasterYooKassaAccountRevoked,
} from "@/lib/payments/yookassa-oauth";
import { notifyMasterYooKassaRevoked } from "@/lib/notifications";
import { computePrepaymentAmount, prepaymentReservationMinutes } from "@/lib/prepayment";
import {
  acquireBookingIdempotency,
  assertDemoBookingRateLimit,
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
import { resolveSubscription } from "@/lib/subscription";
import { profile as mockProfile, services as mockServices } from "@/lib/mock-data";

const bookingSchema = z.object({
  username: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,30}$/),
  serviceId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  name: z.string().min(2),
  phone: z.string().refine(isValidPhoneNumber),
  note: z.string().optional().default(""),
  phoneVerificationToken: z.string().optional().default(""),
  wantsRepeatVisitReminder: z.coerce.boolean().optional().default(false),
  certificateCode: z.string().optional().default(""),
});

export async function POST(request: Request) {
  const parsed = bookingSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверь поля записи." }, { status: 400 });
  }

  if (!isSupabaseConfigured) {
    const demoRateLimit = assertDemoBookingRateLimit(request);
    if (!demoRateLimit.ok) {
      return NextResponse.json({ error: demoRateLimit.message }, { status: 429 });
    }

    const mockService = mockServices.find((service) => service.id === parsed.data.serviceId);
    const startsAtIso = toUtcIsoFromLocalSlot({
      date: parsed.data.date,
      time: parsed.data.time,
      timezone: mockProfile.timezone,
    });
    const resolvedStartsAtIso = startsAtIso ?? new Date().toISOString();
    const endsAtIso =
      new Date(
        new Date(resolvedStartsAtIso).getTime() +
          (mockService?.durationMinutes ?? 60) * 60_000,
      ).toISOString();
    const confirmation = saveMockBookingConfirmation({
      username: parsed.data.username,
      clientName: parsed.data.name,
      serviceTitle: mockService?.title ?? "Запись",
      startsAtIso: resolvedStartsAtIso,
      endsAtIso,
      masterName: mockProfile.fullName,
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

  if (
    isPhoneVerificationRequired &&
    !isPhoneVerificationTokenValid({
      phone: storedPhone,
      username: parsed.data.username,
      token: parsed.data.phoneVerificationToken,
    })
  ) {
    return NextResponse.json(
      { error: "Подтверди номер телефона кодом и попробуй снова." },
      { status: 403 },
    );
  }
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

  // Списание сертификата кодом при онлайн-записи — разово на полную цену
  // услуги (без частичной оплаты долями, это отдельная задача вне текущего
  // ТЗ про QR/сканирование). Баланс списывается через remaining_amount —
  // тот же остаток, что использует сканирование сертификата мастером
  // (/api/certificates/redeem), так что оба канала согласованно уменьшают
  // один и тот же остаток.
  let certificateRow: { id: string; writeOffAmount: number } | null = null;

  if (parsed.data.certificateCode.trim()) {
    const normalizedCode = normalizeCertificateCodeInput(parsed.data.certificateCode);
    const { data: certificateLookup, error: certificateError } = await admin
      .from("gift_certificates")
      .select("id, status, remaining_amount, service_id, expires_at")
      .eq("profile_id", profileRow.id)
      .eq("code", normalizedCode)
      .maybeSingle();

    if (certificateError) {
      return respondWithError(500, "Не получилось проверить сертификат.");
    }

    if (!certificateLookup) {
      return respondWithError(404, "Сертификат с таким кодом не найден.");
    }

    if (
      !isCertificateRedeemable({
        status: certificateLookup.status,
        expiresAt: certificateLookup.expires_at,
      })
    ) {
      return respondWithError(
        409,
        certificateLookup.status === "redeemed"
          ? "Этот сертификат уже использован."
          : "Этот сертификат сейчас недействителен.",
      );
    }

    if (
      !isCertificateApplicableToService({
        certificateServiceId: certificateLookup.service_id
          ? String(certificateLookup.service_id)
          : null,
        requestedServiceId: String(serviceRow.id),
      })
    ) {
      return respondWithError(409, "Этот сертификат не подходит для выбранной услуги.");
    }

    const writeOffAmount = Number(serviceRow.price);
    if (Number(certificateLookup.remaining_amount) < writeOffAmount) {
      return respondWithError(409, "Остатка на сертификате не хватает на эту услугу.");
    }

    certificateRow = {
      id: String(certificateLookup.id),
      writeOffAmount,
    };
  }

  // Запись принимается, пока у мастера есть доступ: оплаченный тариф либо
  // непросроченный пробный период (30 дней от регистрации). Лимита на число
  // записей внутри периода нет — раньше здесь стояла тестовая отсечка «одна
  // запись на free-тарифе», она снята вместе с бесплатным тарифом.
  const masterSubscription = resolveSubscription({
    subscriptionTier: String(profileRow.subscription_tier ?? "free"),
    subscriptionUntil: (profileRow.subscription_until as string | null) ?? null,
    joinedAt: (profileRow.created_at as string | null) ?? null,
    subscriptionPausedUntil:
      (profileRow.subscription_paused_until as string | null) ?? null,
  });

  if (!masterSubscription.isActive) {
    return respondWithError(
      403,
      masterSubscription.pausedUntil
        ? "Мастер взял перерыв и сейчас не принимает новые записи."
        : "Мастер сейчас не принимает новые записи.",
    );
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
  // Перерыв — услуги; перерыв мастера остался запасным на время, пока
  // колонка services.buffer_minutes не появилась в базе (миграция 202610030001).
  const bufferMinutes = Math.max(
    0,
    Number(serviceRow.buffer_minutes ?? profileRow.buffer_minutes ?? 0),
  );
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

  // Атомарно "бронируем" сертификат перед вставкой записи — та же
  // RPC-функция redeem_gift_certificate, что использует сканирование
  // мастером (/api/certificates/redeem): один UPDATE с WHERE-условием на
  // remaining_amount/status не даст двум параллельным запросам списать один
  // и тот же остаток дважды. Если запись потом не создастся — возвращаем
  // списанное обратно.
  let claimedRemainingAmount: number | null = null;
  let claimedBecameRedeemed = false;

  if (certificateRow) {
    const { data: claimResult, error: claimError } = await admin
      .rpc("redeem_gift_certificate", {
        p_certificate_id: certificateRow.id,
        p_write_off_amount: certificateRow.writeOffAmount,
      })
      .select("remaining_amount, status")
      .maybeSingle();

    if (claimError) {
      return respondWithError(500, "Не получилось применить сертификат.");
    }

    if (!claimResult) {
      return respondWithError(409, "Этот сертификат уже использован.");
    }

    claimedRemainingAmount = Number(claimResult.remaining_amount);
    claimedBecameRedeemed = claimResult.status === "redeemed";
  }

  // Настраиваемая предоплата (Модуль 2 из okno-tz-rating-prepayment.md):
  // если на услуге включена предоплата, запись создаётся в статусе
  // pending_payment и слот резервируется на 15 минут под оплату — ту же
  // защиту от двойной записи, что и confirmed (см. bookings_no_overlap_excl
  // в 202607090002_service_prepayment.sql). prepayment_required — снэпшот
  // на момент создания, не пересчитывается, если мастер потом поменяет
  // настройки услуги.
  // Предоплата входит в «Соло. Расширенный» и «Студия». Если тариф мастера
  // её больше не открывает (понизил тариф, не продлил), уже настроенная на
  // услуге предоплата не применяется и запись создаётся обычной — деньги с
  // клиента по неоплачиваемой возможности брать нельзя.
  const canTakePrepayment = masterSubscription.capabilities.includes("prepayment");
  const servicePrepaymentType =
    canTakePrepayment &&
    (serviceRow.prepayment_type === "fixed" || serviceRow.prepayment_type === "percent")
      ? (serviceRow.prepayment_type as "fixed" | "percent")
      : "none";
  const prepaymentRequired = servicePrepaymentType !== "none";
  const prepaymentAmount = prepaymentRequired
    ? computePrepaymentAmount({
        prepaymentType: servicePrepaymentType,
        prepaymentValue: Number(serviceRow.prepayment_value ?? 0),
        servicePrice: Number(serviceRow.price),
      })
    : 0;

  // Предоплата идёт напрямую в магазин мастера через его OAuth-токен
  // ЮKassa (okno-tz-yookassa-oauth.md) — без активного подключения
  // предоплату не показываем клиенту вовсе, бронь без предоплаты не
  // создаём (мастер сам не может включить предоплату не подключив ЮKassa,
  // см. валидацию в createServiceAction/updateServiceAction; эта проверка —
  // защита на случай, если он отключил её уже после того как задал услугу).
  const masterYooKassaToken = prepaymentRequired
    ? await getActiveMasterYooKassaToken(admin, profileRow.id)
    : null;

  if (prepaymentRequired && !masterYooKassaToken) {
    return respondWithError(
      503,
      "Предоплата у этого мастера временно недоступна. Свяжись с мастером напрямую.",
    );
  }

  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .insert({
      profile_id: profileRow.id,
      client_id: clientRow.id,
      service_id: serviceRow.id,
      status: prepaymentRequired ? "pending_payment" : "confirmed",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      busy_until:
        getBusyUntilIso({
          endsAtIso: endsAt.toISOString(),
          bufferMinutes,
        }) ?? slotBusyEnd.toISOString(),
      source: "public_page",
      client_note: parsed.data.note,
      prepayment_required: prepaymentRequired,
      cancellation_token_expires_at:
        getCancellationDeadlineIso({
          startsAtIso: startsAt.toISOString(),
          cancellationNoticeHours: Number(profileRow.cancellation_notice_hours ?? 0),
        }) ?? startsAt.toISOString(),
      repeat_visit_reminder_requested:
        parsed.data.wantsRepeatVisitReminder &&
        Number(serviceRow.repeat_interval_days ?? 0) > 0,
    })
    .select("*")
    .single();

  if (bookingError || !bookingRow) {
    if (certificateRow && claimedRemainingAmount !== null) {
      await admin
        .from("gift_certificates")
        .update({
          remaining_amount: claimedRemainingAmount + certificateRow.writeOffAmount,
          status: "active",
          redeemed_at: claimedBecameRedeemed ? null : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", certificateRow.id);
    }

    if (isSupabaseBookingOverlapError(bookingError)) {
      return respondWithError(409, "Это время уже занято. Выбери другой слот.");
    }

    if (isSupabaseMissingColumnError(bookingError, "prepayment_required")) {
      return respondWithError(
        500,
        "В базе еще нет поля предоплаты. Прогони миграцию 202607090002_service_prepayment.sql.",
      );
    }

    return respondWithError(500, "Не получилось создать запись.");
  }

  if (certificateRow && claimedRemainingAmount !== null) {
    // redeemed_booking_id исторически значил "запись, погасившая сертификат
    // целиком" — при частичном списании имеет смысл только когда остаток
    // дошёл до нуля именно этой записью; полная история списаний (в том
    // числе частичных) живёт в certificate_redemptions.
    if (claimedBecameRedeemed) {
      await admin
        .from("gift_certificates")
        .update({ redeemed_booking_id: bookingRow.id })
        .eq("id", certificateRow.id);
    }

    await admin.from("certificate_redemptions").insert({
      certificate_id: certificateRow.id,
      profile_id: profileRow.id,
      amount_written_off: certificateRow.writeOffAmount,
      balance_after: claimedRemainingAmount,
      channel: "public_booking",
      booking_id: bookingRow.id,
    });
  }

  if (prepaymentRequired) {
    const idempotenceKey = randomUUID();
    const { data: prepaymentRow, error: prepaymentInsertError } = await admin
      .from("prepayments")
      .insert({
        booking_id: bookingRow.id,
        profile_id: profileRow.id,
        amount: prepaymentAmount,
        status: "pending",
        provider: "yookassa",
        master_yookassa_account_id: masterYooKassaToken?.accountId ?? null,
        idempotence_key: idempotenceKey,
        expires_at: new Date(
          Date.now() + prepaymentReservationMinutes * 60_000,
        ).toISOString(),
      })
      .select("id")
      .single();

    if (prepaymentInsertError || !prepaymentRow) {
      logError("Failed to create prepayment row", {
        bookingId: String(bookingRow.id),
        error: prepaymentInsertError,
      });
      await admin.from("bookings").delete().eq("id", bookingRow.id);
      return respondWithError(500, "Не получилось начать оплату предоплаты.");
    }

    try {
      const payment = await createYooKassaPaymentWithToken(masterYooKassaToken!.accessToken, {
        amountRub: prepaymentAmount,
        description: `Предоплата: ${String(serviceRow.title)}, ${String(profileRow.full_name)}`,
        returnUrl: `${env.appUrl}/${parsed.data.username}/confirm?bookingId=${bookingRow.id}`,
        idempotenceKey,
        metadata: {
          kind: "prepayment",
          bookingId: String(bookingRow.id),
          prepaymentId: String(prepaymentRow.id),
        },
      });

      await admin
        .from("prepayments")
        .update({
          provider_payment_id: payment.id,
          confirmation_url: payment.confirmationUrl,
        })
        .eq("id", prepaymentRow.id);

      if (!payment.confirmationUrl) {
        throw new Error("ЮKassa не вернула ссылку на оплату.");
      }

      await writeAuditLog({
        actorKind: "client",
        profileId: String(profileRow.id),
        workspaceId: String(profileRow.workspace_id ?? profileRow.id),
        eventType: "prepayment.started",
        targetType: "prepayment",
        targetId: String(prepaymentRow.id),
        metadata: {
          bookingId: String(bookingRow.id),
          amount: prepaymentAmount,
        },
      });

      const responsePayload = {
        ok: true,
        bookingId: bookingRow.id,
        redirectUrl: payment.confirmationUrl,
      };

      if (idempotencyRowId) {
        await completeBookingIdempotency({
          admin,
          rowId: idempotencyRowId,
          bookingId: String(bookingRow.id),
          payload: responsePayload,
        });
      }

      return NextResponse.json(responsePayload);
    } catch (error) {
      logError("Failed to create YooKassa prepayment", {
        bookingId: String(bookingRow.id),
        error,
      });
      await admin.from("prepayments").update({ status: "failed" }).eq("id", prepaymentRow.id);
      await admin.from("bookings").delete().eq("id", bookingRow.id);

      if (error instanceof YooKassaAuthError) {
        // Мастер отозвал доступ на стороне ЮKassa напрямую, не через кнопку
        // «Отключить» — синхронизируем статус и просим переподключиться.
        await markMasterYooKassaAccountRevoked(admin, profileRow.id);
        await notifyMasterYooKassaRevoked({ chatId: profileRow.telegram_chat_id ?? null });
        return respondWithError(
          503,
          "Предоплата у этого мастера временно недоступна. Свяжись с мастером напрямую.",
        );
      }

      return respondWithError(
        502,
        "ЮKassa не приняла платёж предоплаты. Попробуй еще раз.",
      );
    }
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
              // Бот прицепит к сообщению кнопку «Открыть запись» — из неё
              // мастер сразу видит телефон клиента и может отменить визит.
              bookingId: String(bookingRow.id),
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

  if (bookingRow.repeat_visit_reminder_requested) {
    const repeatVisitRow = buildRepeatVisitReminderEvent({
      profileId: String(profileRow.id),
      bookingId: String(bookingRow.id),
      phone: storedPhone,
      masterName: String(profileRow.full_name),
      serviceTitle: String(serviceRow.title),
      startsAtIso: startsAt.toISOString(),
      repeatIntervalDays: Number(serviceRow.repeat_interval_days ?? 0),
    });

    if (repeatVisitRow.length > 0) {
      const { error: repeatVisitInsertError } = await admin
        .from("notification_events")
        .insert(repeatVisitRow);

      if (repeatVisitInsertError) {
        logError("Failed to enqueue repeat visit reminder", {
          bookingId: String(bookingRow.id),
          error: repeatVisitInsertError,
        });
      }
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

  if (certificateRow) {
    await writeAuditLog({
      actorKind: "client",
      profileId: String(profileRow.id),
      workspaceId: String(profileRow.workspace_id ?? profileRow.id),
      eventType: "gift_certificate.redeemed",
      targetType: "gift_certificate",
      targetId: certificateRow.id,
      metadata: {
        bookingId: String(bookingRow.id),
        amountWrittenOff: certificateRow.writeOffAmount,
        channel: "public_booking",
      },
    });
  }

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
