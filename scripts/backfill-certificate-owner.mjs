// Проставляет purchaser_phone_hash существующим сертификатам.
//
//   node --env-file=.env.local scripts/backfill-certificate-owner.mjs          # сухой прогон
//   node --env-file=.env.local scripts/backfill-certificate-owner.mjs --write  # запись
//
// Зачем: до миграции 202609090001 покупатель хранился одним текстовым полем
// «почта · контакт». Кабинет клиента ищет по хешу телефона, и без прохода
// старые сертификаты не нашлись бы у своих покупателей.
//
// Хеш считается той же формулой, что в src/lib/booking.ts: sha256 от секрета и
// цифр номера. Формула продублирована здесь намеренно — путь через алиасы
// @/lib из .mjs не резолвится. Чтобы дубликат не разъехался с оригиналом,
// скрипт сверяет себя с известным значением перед началом работы.

import { createDecipheriv, createHash } from "node:crypto";

const write = process.argv.includes("--write");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const phoneSecret = process.env.PHONE_ENCRYPTION_SECRET;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY.");
}

if (!phoneSecret) {
  throw new Error("Нет PHONE_ENCRYPTION_SECRET — без него хеш не совпадёт с базой.");
}

function normalizePhoneDigits(phone) {
  return phone.replace(/\D/g, "");
}

function hashPhone(phone) {
  return createHash("sha256").update(`${phoneSecret}:${phone}`).digest("hex");
}

function purchaserPhoneHashFromContact(contact) {
  for (const part of String(contact ?? "").split(/[·,;]/)) {
    const digits = normalizePhoneDigits(part);

    if (digits.length >= 10 && digits.length <= 15) {
      return hashPhone(digits);
    }
  }

  return null;
}

async function rest(path, init) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

// Самопроверка формулы на живых данных: расшифровываем телефон клиента и
// сверяем хеш от него с тем, что записало приложение. Если формулы разъехались,
// скрипт проставил бы всем сертификатам мусор — а увидеть это потом было бы
// нечем, потому что хеш необратим.
function decryptPhone(value) {
  const [version, iv, tag, data] = String(value).split(":");

  if (version !== "enc1") {
    return null;
  }

  const key = createHash("sha256").update(phoneSecret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

const sample = await rest(
  "clients?select=phone_encrypted,phone_hash,phone_last4&phone_hash=not.is.null&limit=1",
);

if (sample.length === 0) {
  console.log("Клиентов с хешем нет — сверить формулу не с чем.");
} else {
  const phone = decryptPhone(sample[0].phone_encrypted);

  if (!phone) {
    console.log("Телефон клиента в старом формате — сверку пропускаю.");
  } else if (hashPhone(phone) !== sample[0].phone_hash) {
    throw new Error(
      [
        "Формула хеша в скрипте разошлась с той, что в приложении.",
        "Сверь hashPhone в src/lib/booking.ts — иначе сертификаты привяжутся к мусору.",
      ].join("\n"),
    );
  } else {
    console.log(`Формула сверена по клиенту с хвостом номера ${sample[0].phone_last4}.`);
  }
}

const rows = await rest(
  "gift_certificates?select=id,code,purchaser_contact&purchaser_phone_hash=is.null",
).catch((error) => {
  if (String(error.message).includes("purchaser_phone_hash does not exist")) {
    throw new Error(
      "Нет колонки purchaser_phone_hash. Прогони миграцию 202609090001_certificate_owner.sql (supabase db push).",
    );
  }

  throw error;
});

console.log(`Сертификатов без хеша покупателя: ${rows.length}`);

let matched = 0;

for (const row of rows) {
  const hash = purchaserPhoneHashFromContact(row.purchaser_contact);

  if (!hash) {
    continue;
  }

  matched += 1;

  if (write) {
    await rest(`gift_certificates?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ purchaser_phone_hash: hash }),
    });
  }
}

console.log(
  `Телефон нашёлся в контакте у ${matched} из ${rows.length}. У остальных в контакте была только почта — они привяжутся, когда получатель введёт код.`,
);

console.log(
  write ? "Записано." : "Сухой прогон. Запуск с записью: добавь --write",
);
