import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// Шифрование refreshToken «Моего налога» перед записью в nalog_sync_state.
// Тот же формат, что у токенов ЮKassa (src/lib/payments/yookassa-oauth.ts), но
// на отдельном секрете: доступ к личному кабинету ФНС и доступ к магазину
// мастера — разные по последствиям вещи, и утечка одного ключа не должна
// вскрывать оба.

const ENCRYPTION_VERSION = "nlg1";

function getKey() {
  const secret = env.nalogEncryptionSecret;
  if (!secret) {
    throw new Error(
      "Нужен NALOG_ENCRYPTION_SECRET для шифрования refreshToken «Моего налога».",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptNalogSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptNalogSecret(encrypted: string) {
  const [version, ivBase64Url, authTagBase64Url, dataBase64Url] = encrypted.split(":");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivBase64Url ||
    !authTagBase64Url ||
    !dataBase64Url
  ) {
    throw new Error("Некорректный формат зашифрованного токена «Моего налога».");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivBase64Url, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagBase64Url, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataBase64Url, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
