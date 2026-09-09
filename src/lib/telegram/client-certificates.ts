import { hashPhone, isValidPhoneNumber, normalizePhoneDigits } from "@/lib/booking";
import { normalizeCertificateCodeInput } from "@/lib/gift-certificates";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Сертификаты в кабинете клиента.
//
// Сертификат — предъявительский документ: погасить его может тот, у кого код
// на руках, и привязка к человеку этого не меняет. Она отвечает только на
// вопрос «в чьём кабинете показывать».
//
// Отсюда и два хеша (202609090001_certificate_owner.sql): покупатель известен
// сразу, если оставил телефон, а получатель подарка — только когда сам введёт
// код. Больше о нём никто ничего не сообщает.

export type ClientCertificate = {
  id: string;
  code: string;
  masterName: string;
  masterUsername: string;
  amountRub: number;
  remainingRub: number;
  status: string;
  expiresAtIso: string | null;
  // Сертификат на конкретную услугу, а не на сумму.
  serviceTitle: string | null;
};

const certificateSelect =
  "id, code, amount, remaining_amount, status, expires_at, services(title), profiles(username, full_name)";

// Показываем только то, чем ещё можно воспользоваться. Неоплаченные
// (pending) и отменённые в кабинете только путали бы: первых человек не
// покупал, вторых у него нет.
const usableStatuses = ["paid", "active", "redeemed"];

export async function getClientCertificates(input: {
  phoneHash: string;
}): Promise<ClientCertificate[]> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("gift_certificates")
    .select(certificateSelect)
    .or(
      `owner_phone_hash.eq.${input.phoneHash},purchaser_phone_hash.eq.${input.phoneHash}`,
    )
    .in("status", usableStatuses)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return [];
  }

  return (data as Record<string, unknown>[]).map(mapCertificate);
}

export type ClaimCertificateResult =
  | { status: "claimed"; certificate: ClientCertificate }
  | { status: "not_found" }
  | { status: "not_usable" }
  | { status: "taken" }
  | { status: "failed" };

export async function claimCertificateByCode(input: {
  code: string;
  phoneHash: string;
}): Promise<ClaimCertificateResult> {
  const code = normalizeCertificateCodeInput(input.code);

  if (!code) {
    return { status: "not_found" };
  }

  const admin = createSupabaseAdminClient();

  const { data: row, error } = await admin
    .from("gift_certificates")
    .select(`${certificateSelect}, owner_phone_hash`)
    .eq("code", code)
    .maybeSingle();

  if (error) {
    logError("Failed to load certificate for claim", { error });
    return { status: "failed" };
  }

  if (!row) {
    return { status: "not_found" };
  }

  if (!usableStatuses.includes(String(row.status))) {
    return { status: "not_usable" };
  }

  const currentOwner = row.owner_phone_hash ? String(row.owner_phone_hash) : null;

  // Первый предъявитель забирает сертификат в свой кабинет. Второму отвечаем
  // честно: код рабочий, но показывается он уже не здесь. Погасить его у
  // мастера это по-прежнему не мешает — код предъявительский.
  if (currentOwner && currentOwner !== input.phoneHash) {
    return { status: "taken" };
  }

  if (!currentOwner) {
    const { error: claimError } = await admin
      .from("gift_certificates")
      .update({
        owner_phone_hash: input.phoneHash,
        owner_claimed_at: new Date().toISOString(),
      })
      .eq("id", String(row.id))
      .is("owner_phone_hash", null);

    if (claimError) {
      logError("Failed to claim certificate", { error: claimError });
      return { status: "failed" };
    }
  }

  return { status: "claimed", certificate: mapCertificate(row) };
}

// Хеш покупателя при покупке. Контакт — свободное поле: там может быть почта,
// телефон или и то и другое через разделитель. Берём то, что похоже на номер,
// и только если похоже — иначе сертификат просто не привяжется, и это лучше,
// чем привязать его к мусору.
export function purchaserPhoneHashFromContact(contact: string): string | null {
  for (const part of contact.split(/[·,;]/)) {
    const digits = normalizePhoneDigits(part);

    if (digits.length >= 10 && isValidPhoneNumber(digits)) {
      return hashPhone(digits);
    }
  }

  return null;
}

function mapCertificate(row: Record<string, unknown>): ClientCertificate {
  const first = <T,>(value: unknown): T | null =>
    Array.isArray(value) ? ((value[0] as T) ?? null) : ((value as T) ?? null);

  const service = first<{ title?: string }>(row.services);
  const profile = first<{ username?: string; full_name?: string }>(row.profiles);
  const amount = Number(row.amount ?? 0);

  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    masterName: String(profile?.full_name ?? ""),
    masterUsername: String(profile?.username ?? ""),
    amountRub: amount,
    // remaining_amount появился позже самой таблицы: у старых строк его нет,
    // и тогда остаток равен номиналу.
    remainingRub: row.remaining_amount === null ? amount : Number(row.remaining_amount),
    status: String(row.status ?? ""),
    expiresAtIso: row.expires_at ? String(row.expires_at) : null,
    serviceTitle: service?.title ?? null,
  };
}
