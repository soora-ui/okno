import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { env } from "@/lib/env";
import { logWarn } from "@/lib/observability/logger";

const PHONE_ENCRYPTION_VERSION = "enc1";

function getPhoneSecret() {
  const secret = env.phoneEncryptionSecret;

  if (!secret) {
    throw new Error(
      "Нужен PHONE_ENCRYPTION_SECRET для защиты телефонов клиентов. Добавь его в .env.local.",
    );
  }

  return secret;
}

function getPhoneKey() {
  return createHash("sha256").update(getPhoneSecret()).digest();
}

export function phoneLast4(phone: string) {
  const digits = normalizePhoneDigits(phone);
  return digits.slice(-4);
}

export function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

export function isValidPhoneNumber(phone: string) {
  const digits = normalizePhoneDigits(phone);
  return digits.length >= 10 && digits.length <= 15;
}

export function encryptPhone(phone: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getPhoneKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(phone, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    PHONE_ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

// Лог о нешифрованных телефонах пишем ограниченно, чтобы проходы по
// legacy-клиентам не заваливали мониторинг одинаковыми записями.
let unencryptedPhoneWarningsLeft = 20;

function warnUnencryptedPhone() {
  if (unencryptedPhoneWarningsLeft <= 0) {
    return;
  }

  unencryptedPhoneWarningsLeft -= 1;
  logWarn(
    "decryptPhone: found legacy unencrypted phone value, needs re-encryption migration",
  );
}

export function decryptPhone(phoneEncrypted: string) {
  if (!phoneEncrypted) {
    return "";
  }

  if (!phoneEncrypted.startsWith(`${PHONE_ENCRYPTION_VERSION}:`)) {
    warnUnencryptedPhone();

    try {
      const decoded = Buffer.from(phoneEncrypted, "base64").toString("utf8");
      const normalizedInput = phoneEncrypted.replace(/=+$/u, "");
      const normalizedDecoded = Buffer.from(decoded, "utf8")
        .toString("base64")
        .replace(/=+$/u, "");

      return normalizedInput === normalizedDecoded ? decoded : phoneEncrypted;
    } catch {
      return phoneEncrypted;
    }
  }

  const [, ivBase64Url, authTagBase64Url, encryptedBase64Url] =
    phoneEncrypted.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getPhoneKey(),
    Buffer.from(ivBase64Url, "base64url"),
  );

  decipher.setAuthTag(Buffer.from(authTagBase64Url, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64Url, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashPhone(phone: string) {
  return createHash("sha256")
    .update(`${getPhoneSecret()}:${phone}`)
    .digest("hex");
}

export function toUtcIsoFromLocalSlot(input: {
  date: string;
  time: string;
  timezone: string;
}) {
  return DateTime.fromISO(`${input.date}T${input.time}`, {
    zone: input.timezone,
  }).toUTC().toISO();
}

export function isSameLocalSlot(input: {
  startsAtIso: string;
  timezone: string;
  date: string;
  time: string;
}) {
  const current = DateTime.fromISO(input.startsAtIso, { zone: "utc" }).setZone(input.timezone);

  return (
    current.isValid &&
    current.toISODate() === input.date &&
    current.toFormat("HH:mm") === input.time
  );
}

export function getCancellationDeadlineIso(input: {
  startsAtIso: string;
  cancellationNoticeHours: number;
}) {
  return DateTime.fromISO(input.startsAtIso, { zone: "utc" })
    .minus({ hours: Math.max(0, input.cancellationNoticeHours) })
    .toISO();
}

export function getBusyUntilIso(input: {
  endsAtIso: string;
  bufferMinutes: number;
}) {
  return DateTime.fromISO(input.endsAtIso, { zone: "utc" })
    .plus({ minutes: Math.max(0, input.bufferMinutes) })
    .toISO();
}

export function humanizeBookingDate(input: {
  startsAtIso: string;
  timezone: string;
}) {
  return DateTime.fromISO(input.startsAtIso, { zone: "utc" })
    .setZone(input.timezone)
    .setLocale("ru")
    .toFormat("d LLLL, HH:mm");
}

export function isCancellationAllowed(input: {
  startsAtIso: string;
  cancellationTokenExpiresAt: string | null;
  timezone: string;
  status: "confirmed" | "cancelled_by_client" | "cancelled_by_master";
}) {
  if (input.status !== "confirmed") {
    return false;
  }

  if (!input.cancellationTokenExpiresAt) {
    return true;
  }

  const deadline = DateTime.fromISO(input.cancellationTokenExpiresAt, { zone: "utc" });
  const now = DateTime.now().setZone(input.timezone);

  if (!deadline.isValid) {
    return false;
  }

  return now <= deadline.setZone(input.timezone);
}
