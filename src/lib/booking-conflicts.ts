import { isSupabaseUndefinedRoutineError } from "@/lib/supabase/auth-errors";

type QueryResponse<T> = {
  data: T[] | null;
  error: unknown | null;
};

type RpcResponse = {
  data: boolean | null;
  error: unknown | null;
};

type RpcBuilder = PromiseLike<RpcResponse>;

type BookingConflictRow = {
  id?: string;
  starts_at?: string;
  ends_at?: string;
};

type BlockedSlotConflictRow = {
  starts_at?: string;
  ends_at?: string;
};

type QueryBuilder<T> = PromiseLike<QueryResponse<T>> & {
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  lt(column: string, value: unknown): QueryBuilder<T>;
  gt(column: string, value: unknown): QueryBuilder<T>;
  neq(column: string, value: unknown): QueryBuilder<T>;
};

type ConflictClient = {
  rpc(name: string, params: Record<string, unknown>): RpcBuilder;
  from(table: "bookings"): {
    select(columns: string): QueryBuilder<BookingConflictRow>;
  };
  from(table: "blocked_slots"): {
    select(columns: string): QueryBuilder<BlockedSlotConflictRow>;
  };
};

type ConflictCheckInput = {
  client: unknown;
  profileId: string;
  candidateStartIso: string;
  candidateBusyEndIso: string;
  bufferMinutes: number;
  excludeBookingId?: string;
};

type ConflictCheckResult = {
  hasConflict: boolean;
  error: unknown | null;
};

function overlaps(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
) {
  return startA < endB && endA > startB;
}

async function checkBookingConflictFallback(
  input: ConflictCheckInput,
): Promise<ConflictCheckResult> {
  const client = input.client as ConflictClient;
  const candidateStart = new Date(input.candidateStartIso);
  const candidateBusyEnd = new Date(input.candidateBusyEndIso);
  const normalizedBufferMinutes = Math.max(input.bufferMinutes, 0);
  const bookingEndThreshold = new Date(
    candidateStart.getTime() - normalizedBufferMinutes * 60_000,
  );

  let bookingsQuery = client
    .from("bookings")
    .select("id, starts_at, ends_at")
    .eq("profile_id", input.profileId)
    .in("status", ["confirmed", "pending_payment"])
    .lt("starts_at", input.candidateBusyEndIso)
    .gt("ends_at", bookingEndThreshold.toISOString());

  if (input.excludeBookingId) {
    bookingsQuery = bookingsQuery.neq("id", input.excludeBookingId);
  }

  const [bookingResult, blockedResult] = await Promise.all([
    bookingsQuery,
    client
      .from("blocked_slots")
      .select("starts_at, ends_at")
      .eq("profile_id", input.profileId)
      .lt("starts_at", input.candidateBusyEndIso)
      .gt("ends_at", input.candidateStartIso),
  ]);

  if (bookingResult.error || blockedResult.error) {
    return {
      hasConflict: false,
      error: bookingResult.error ?? blockedResult.error,
    };
  }

  const bookingConflict = (bookingResult.data ?? []).some(
    (booking: { starts_at?: string; ends_at?: string }) => {
      if (!booking.starts_at || !booking.ends_at) {
        return false;
      }

      const bookingStart = new Date(booking.starts_at);
      const bookingBusyEnd = new Date(
        new Date(booking.ends_at).getTime() + normalizedBufferMinutes * 60_000,
      );

      return overlaps(candidateStart, candidateBusyEnd, bookingStart, bookingBusyEnd);
    },
  );

  if (bookingConflict) {
    return { hasConflict: true, error: null };
  }

  const blockedConflict = (blockedResult.data ?? []).some(
    (blockedSlot: { starts_at?: string; ends_at?: string }) => {
      if (!blockedSlot.starts_at || !blockedSlot.ends_at) {
        return false;
      }

      return overlaps(
        candidateStart,
        candidateBusyEnd,
        new Date(blockedSlot.starts_at),
        new Date(blockedSlot.ends_at),
      );
    },
  );

  return { hasConflict: blockedConflict, error: null };
}

export async function checkBookingConflict(
  input: ConflictCheckInput,
): Promise<ConflictCheckResult> {
  const client = input.client as ConflictClient;
  const rpcName = input.excludeBookingId
    ? "has_booking_conflict_excluding_current"
    : "has_booking_conflict";
  const rpcParams = input.excludeBookingId
    ? {
        p_profile_id: input.profileId,
        p_candidate_start: input.candidateStartIso,
        p_candidate_busy_end: input.candidateBusyEndIso,
        p_buffer_minutes: input.bufferMinutes,
        p_exclude_booking_id: input.excludeBookingId,
      }
    : {
        p_profile_id: input.profileId,
        p_candidate_start: input.candidateStartIso,
        p_candidate_busy_end: input.candidateBusyEndIso,
        p_buffer_minutes: input.bufferMinutes,
      };

  const { data, error } = await client.rpc(rpcName, rpcParams);

  if (!error) {
    return { hasConflict: Boolean(data), error: null };
  }

  if (!isSupabaseUndefinedRoutineError(error, rpcName)) {
    return { hasConflict: false, error };
  }

  return checkBookingConflictFallback(input);
}
