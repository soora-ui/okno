import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Куда и когда мастер может напомнить о себе клиенту.
//
// Согласие клиента здесь — факт подключения к боту: он либо поделился
// номером (личность по телефону), либо нажал «Напоминать в Telegram» на
// одной из записей. Ни того ни другого — писать некуда, и кнопки в карточке
// нет. Телефон для этого не используется намеренно: SMS «мы соскучились» без
// согласия — это уже рассылка.

export type ClientReturnReachability = {
  chatId: string | null;
  lastSentAtIso: string | null;
};

// Не чаще раза в две недели на клиента. Лимит — часть договорённости
// «не массово»: одно напоминание, а не серия.
export const clientReturnReminderCooldownDays = 14;

export async function getClientReturnReachability(input: {
  profileId: string;
}): Promise<Map<string, ClientReturnReachability>> {
  const admin = createSupabaseAdminClient();
  const result = new Map<string, ClientReturnReachability>();

  const [clientResult, bookingResult, reminderResult] = await Promise.all([
    admin.from("clients").select("id, phone_hash").eq("profile_id", input.profileId),
    admin
      .from("bookings")
      .select("id, client_id")
      .eq("profile_id", input.profileId)
      .not("client_id", "is", null),
    admin
      .from("client_return_reminders")
      .select("client_id, sent_at")
      .eq("profile_id", input.profileId)
      .order("sent_at", { ascending: false }),
  ]);

  if (clientResult.error || bookingResult.error || reminderResult.error) {
    logError("Failed to load client return reachability", {
      profileId: input.profileId,
      error: clientResult.error ?? bookingResult.error ?? reminderResult.error,
    });

    return result;
  }

  const clients = (clientResult.data ?? []) as Array<{ id: string; phone_hash: string | null }>;
  const bookings = (bookingResult.data ?? []) as Array<{ id: string; client_id: string }>;
  const reminders = (reminderResult.data ?? []) as Array<{ client_id: string; sent_at: string }>;

  for (const client of clients) {
    result.set(String(client.id), { chatId: null, lastSentAtIso: null });
  }

  // Самое свежее напоминание — первое в выдаче: порядок задан запросом.
  for (const reminder of reminders) {
    const entry = result.get(String(reminder.client_id));

    if (entry && !entry.lastSentAtIso) {
      entry.lastSentAtIso = String(reminder.sent_at);
    }
  }

  // Дорога первая: личность по телефону. Один запрос по всем хешам сразу.
  const phoneHashes = clients
    .map((client) => client.phone_hash)
    .filter((hash): hash is string => Boolean(hash));

  if (phoneHashes.length > 0) {
    const { data: identityRows } = await admin
      .from("client_telegram_identities")
      .select("phone_hash, chat_id")
      .in("phone_hash", phoneHashes)
      .is("unlinked_at", null);

    const chatByHash = new Map(
      ((identityRows ?? []) as Array<{ phone_hash: string; chat_id: string }>).map((row) => [
        String(row.phone_hash),
        String(row.chat_id),
      ]),
    );

    for (const client of clients) {
      const chatId = client.phone_hash ? chatByHash.get(client.phone_hash) : undefined;

      if (chatId) {
        result.get(String(client.id))!.chatId = chatId;
      }
    }
  }

  // Дорога вторая: привязка к записи. Покрывает тех, кто номером не делился,
  // но просил напоминать хотя бы об одном визите.
  const clientByBooking = new Map(bookings.map((row) => [String(row.id), String(row.client_id)]));
  const bookingIds = [...clientByBooking.keys()];

  if (bookingIds.length > 0) {
    const { data: linkRows } = await admin
      .from("client_telegram_links")
      .select("booking_id, chat_id")
      .in("booking_id", bookingIds)
      .is("unlinked_at", null);

    for (const row of (linkRows ?? []) as Array<{ booking_id: string; chat_id: string }>) {
      const clientId = clientByBooking.get(String(row.booking_id));
      const entry = clientId ? result.get(clientId) : undefined;

      if (entry && !entry.chatId) {
        entry.chatId = String(row.chat_id);
      }
    }
  }

  return result;
}

export async function resolveClientReturnChat(input: {
  profileId: string;
  clientId: string;
}): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  const { data: clientRow, error } = await admin
    .from("clients")
    .select("id, phone_hash")
    .eq("id", input.clientId)
    .eq("profile_id", input.profileId)
    .maybeSingle();

  if (error || !clientRow) {
    return null;
  }

  if (clientRow.phone_hash) {
    const { data: identity } = await admin
      .from("client_telegram_identities")
      .select("chat_id")
      .eq("phone_hash", String(clientRow.phone_hash))
      .is("unlinked_at", null)
      .maybeSingle();

    if (identity?.chat_id) {
      return String(identity.chat_id);
    }
  }

  const { data: bookingRows } = await admin
    .from("bookings")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("profile_id", input.profileId);

  const bookingIds = (bookingRows ?? []).map((row) => String(row.id));

  if (bookingIds.length === 0) {
    return null;
  }

  const { data: link } = await admin
    .from("client_telegram_links")
    .select("chat_id")
    .in("booking_id", bookingIds)
    .is("unlinked_at", null)
    .order("linked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return link?.chat_id ? String(link.chat_id) : null;
}

export async function getLastClientReturnReminderAt(input: {
  clientId: string;
}): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("client_return_reminders")
    .select("sent_at")
    .eq("client_id", input.clientId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.sent_at ? String(data.sent_at) : null;
}

export async function recordClientReturnReminder(input: {
  profileId: string;
  clientId: string;
  chatId: string;
  message: string;
  draftMessage: string | null;
}) {
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from("client_return_reminders").insert({
    profile_id: input.profileId,
    client_id: input.clientId,
    chat_id: input.chatId,
    message: input.message,
    draft_message: input.draftMessage,
  });

  if (error) {
    logError("Failed to record client return reminder", {
      profileId: input.profileId,
      clientId: input.clientId,
      error,
    });
  }
}
