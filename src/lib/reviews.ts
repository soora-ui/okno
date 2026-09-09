import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Приватные отзывы: их видит только мастер, которому они оставлены.
//
// Клиент правит свой отзыв сколько угодно — он не публичный, и передумать
// после «поставил пять сгоряча» нормально. Мастер не правит и не удаляет:
// отзыв, который можно стереть, перестаёт быть обратной связью.

export const reviewMinRating = 1;
export const reviewMaxRating = 5;
export const reviewMaxCommentLength = 2000;

export type Review = {
  id: string;
  bookingId: string;
  clientId: string | null;
  rating: number;
  comment: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ReviewWithContext = Review & {
  clientName: string;
  serviceTitle: string;
  startsAtIso: string;
};

export function isValidRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= reviewMinRating &&
    value <= reviewMaxRating
  );
}

// Отзыв клиента о конкретном визите. Один на визит: оценивают процедуру, а не
// мастера вообще, поэтому повторная отправка правит существующий.
export async function upsertReview(input: {
  profileId: string;
  bookingId: string;
  clientId: string | null;
  authorPhoneHash: string;
  rating: number;
  comment: string;
}): Promise<Review | null> {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("reviews")
    .upsert(
      {
        profile_id: input.profileId,
        booking_id: input.bookingId,
        client_id: input.clientId,
        author_phone_hash: input.authorPhoneHash,
        rating: input.rating,
        comment: input.comment.slice(0, reviewMaxCommentLength),
        updated_at: nowIso,
      },
      { onConflict: "booking_id" },
    )
    .select("id, booking_id, client_id, rating, comment, created_at, updated_at")
    .maybeSingle();

  if (error || !data) {
    logError("Failed to save review", { bookingId: input.bookingId, error });
    return null;
  }

  return mapReview(data as Record<string, unknown>);
}

// Отзывы, оставленные этим человеком: кабинет показывает их рядом с визитами,
// чтобы было видно, что уже оценено, и можно было поправить.
export async function getReviewsByAuthor(input: {
  authorPhoneHash: string;
}): Promise<Review[]> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("reviews")
    .select("id, booking_id, client_id, rating, comment, created_at, updated_at")
    .eq("author_phone_hash", input.authorPhoneHash)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return [];
  }

  return (data as Record<string, unknown>[]).map(mapReview);
}

// Лента отзывов мастера.
export async function getReviewsForProfile(input: {
  profileId: string;
  limit?: number;
}): Promise<ReviewWithContext[]> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("reviews")
    .select(
      "id, booking_id, client_id, rating, comment, created_at, updated_at, clients(name), bookings(starts_at, services(title))",
    )
    .eq("profile_id", input.profileId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);

  if (error || !data) {
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => {
    const first = <T,>(value: unknown): T | null =>
      Array.isArray(value) ? ((value[0] as T) ?? null) : ((value as T) ?? null);

    const client = first<{ name?: string }>(row.clients);
    const booking = first<{ starts_at?: string; services?: unknown }>(row.bookings);
    const service = first<{ title?: string }>(booking?.services);

    return {
      ...mapReview(row),
      clientName: String(client?.name ?? "Клиент"),
      serviceTitle: String(service?.title ?? ""),
      startsAtIso: String(booking?.starts_at ?? ""),
    };
  });
}

// Средняя оценка и количество — шапка ленты. Считается по всем отзывам, а не
// по показанной странице.
export function summarizeReviews(reviews: Pick<Review, "rating">[]) {
  if (reviews.length === 0) {
    return { count: 0, average: 0 };
  }

  const total = reviews.reduce((sum, review) => sum + review.rating, 0);

  return {
    count: reviews.length,
    average: Math.round((total / reviews.length) * 10) / 10,
  };
}

function mapReview(row: Record<string, unknown>): Review {
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    clientId: row.client_id ? String(row.client_id) : null,
    rating: Number(row.rating ?? 0),
    comment: String(row.comment ?? ""),
    createdAtIso: String(row.created_at),
    updatedAtIso: String(row.updated_at ?? row.created_at),
  };
}
