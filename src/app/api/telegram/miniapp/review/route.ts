import { NextResponse } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/observability/logger";
import {
  reviewMaxCommentLength,
  reviewMaxRating,
  reviewMinRating,
  upsertReview,
} from "@/lib/reviews";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getClientIdentity,
  getClientPastBookings,
} from "@/lib/telegram/client-identity";
import { validateMiniAppInitData } from "@/lib/telegram/miniapp-auth";

// Отзыв о визите из кабинета клиента.
//
// Оставить можно только о своём прошедшем визите: список тот же, что рисует
// кабинет, поэтому оценить чужую запись или будущую нельзя. Повторная отправка
// правит существующий отзыв — он приватный, и передумать нормально.

const requestSchema = z.object({
  initData: z.string(),
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(reviewMinRating).max(reviewMaxRating),
  comment: z.string().trim().max(reviewMaxCommentLength).default(""),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверь оценку и текст." }, { status: 400 });
  }

  const auth = validateMiniAppInitData(parsed.data.initData);

  if (auth.status !== "ok") {
    return NextResponse.json(
      { error: "Не получилось подтвердить, что это ты. Открой кабинет заново." },
      { status: 401 },
    );
  }

  const identity = await getClientIdentity({ telegramUserId: auth.user.telegramUserId });

  if (!identity) {
    return NextResponse.json(
      { error: "Сначала подтверди номер телефона." },
      { status: 403 },
    );
  }

  const past = await getClientPastBookings({ phoneHash: identity.phoneHash, limit: 50 });
  const booking = past.find((item) => item.bookingId === parsed.data.bookingId);

  if (!booking) {
    return NextResponse.json({ error: "Визит не найден." }, { status: 404 });
  }

  // client_id берём из самой записи, а не из тела запроса: он нужен, чтобы
  // отзыв встал в карточку клиента у мастера.
  const admin = createSupabaseAdminClient();
  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select("client_id")
    .eq("id", booking.bookingId)
    .maybeSingle();

  if (bookingError) {
    logError("Failed to load booking for review", { error: bookingError });
    return NextResponse.json({ error: "Не получилось сохранить отзыв." }, { status: 500 });
  }

  const review = await upsertReview({
    profileId: booking.profileId,
    bookingId: booking.bookingId,
    clientId: bookingRow?.client_id ? String(bookingRow.client_id) : null,
    authorPhoneHash: identity.phoneHash,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  });

  return review
    ? NextResponse.json({ ok: true, review })
    : NextResponse.json({ error: "Не получилось сохранить отзыв." }, { status: 500 });
}
