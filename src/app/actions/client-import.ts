"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { encryptPhone, hashPhone, phoneLast4 } from "@/lib/booking";
import {
  CLIENT_IMPORT_MAX_ROWS,
  CLIENT_IMPORT_NOTES_MAX_LENGTH,
  normalizeImportedPhone,
} from "@/lib/client-import/parse";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClientImportActionResult =
  | { success: true; added: number; alreadyExisted: number; message: string }
  | { success: false; message: string };

// Файл разбирается в браузере (src/lib/client-import), сюда приходят готовые
// строки. Телефон всё равно нормализуем заново: клиенту не доверяем.
const importPayloadSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(1).max(32),
      notes: z.string().max(CLIENT_IMPORT_NOTES_MAX_LENGTH).default(""),
    }),
  )
  .min(1)
  .max(CLIENT_IMPORT_MAX_ROWS);

const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

// Переносим базу из другой CRM: добавляем только новых по номеру. Тех, кто
// уже есть у мастера, не трогаем — их имя и заметки в okno могут быть свежее.
export async function importClientsAction(
  payload: Array<{ name: string; phone: string; notes: string }>,
): Promise<ClientImportActionResult> {
  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile;

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войдите заново." };
  }

  if (!isSupabaseConfigured) {
    return { success: false, message: "В демо-режиме перенос клиентов недоступен." };
  }

  const parsed = importPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return { success: false, message: "Не получилось прочитать список клиентов. Попробуйте загрузить файл ещё раз." };
  }

  const byHash = new Map<string, { name: string; phone: string; notes: string }>();

  for (const row of parsed.data) {
    const phone = normalizeImportedPhone(row.phone);
    if (!phone) {
      continue;
    }

    const hash = hashPhone(phone);
    if (!byHash.has(hash)) {
      byHash.set(hash, { name: row.name, phone, notes: row.notes.trim() });
    }
  }

  if (byHash.size === 0) {
    return { success: false, message: "В списке нет ни одного корректного номера." };
  }

  const supabase = await createSupabaseServerClient();
  const existingHashes = new Set<string>();

  for (const hashes of chunk(Array.from(byHash.keys()), CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("clients")
      .select("phone_hash")
      .eq("profile_id", profile.id)
      .in("phone_hash", hashes);

    if (error) {
      logError("Client import: failed to look up existing clients", { profileId: profile.id, error });
      return { success: false, message: "Не получилось сверить клиентов с вашей базой." };
    }

    for (const row of data ?? []) {
      existingHashes.add(String(row.phone_hash));
    }
  }

  const rowsToInsert = Array.from(byHash.entries())
    .filter(([hash]) => !existingHashes.has(hash))
    .map(([hash, client]) => ({
      profile_id: profile.id,
      name: client.name,
      phone_encrypted: encryptPhone(client.phone),
      phone_last4: phoneLast4(client.phone),
      phone_hash: hash,
      notes: client.notes,
    }));

  let added = 0;

  for (const rows of chunk(rowsToInsert, CHUNK_SIZE)) {
    const { error } = await supabase.from("clients").insert(rows);

    if (error) {
      logError("Client import: failed to insert clients", { profileId: profile.id, added, error });
      revalidatePath("/clients");
      return {
        success: false,
        message:
          added > 0
            ? `Добавили ${added}, дальше что-то сломалось. Загрузите файл ещё раз — уже добавленные не задвоятся.`
            : "Не получилось сохранить клиентов. Попробуйте ещё раз.",
      };
    }

    added += rows.length;
  }

  const alreadyExisted = byHash.size - rowsToInsert.length;

  await writeAuditLog({
    eventType: "clients.imported",
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    targetType: "client",
    metadata: { added, alreadyExisted, received: parsed.data.length },
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");

  return {
    success: true,
    added,
    alreadyExisted,
    message:
      added > 0
        ? `Готово: добавили ${added}.${alreadyExisted > 0 ? ` Ещё ${alreadyExisted} уже были в базе — их не трогали.` : ""}`
        : "Все клиенты из файла уже есть в вашей базе.",
  };
}
