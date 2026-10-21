// Разбор таблицы клиентов из чужой CRM в то, что okno умеет хранить:
// имя, телефон и заметка. Колонки ищем по заголовкам — у YCLIENTS это
// «Имя», «Телефон», «Дополнительный телефон», «Email», «Комментарий»,
// «Дата рождения»; у DIKIDI и своих таблиц названия похожие. Код общий для
// браузера (превью) и сервера (повторная проверка перед записью в базу).

import type { SpreadsheetRows } from "@/lib/client-import/spreadsheet";

export const CLIENT_IMPORT_MAX_ROWS = 10_000;
export const CLIENT_IMPORT_NOTES_MAX_LENGTH = 1_000;

export type ImportedClient = {
  name: string;
  // Только цифры с кодом страны, как их сохраняет форма записи: «79780000000».
  phone: string;
  notes: string;
};

export type ClientImportSkipReason = "no_phone" | "bad_phone" | "duplicate";

export type ClientImportResult = {
  clients: ImportedClient[];
  skipped: Array<{ rowNumber: number; reason: ClientImportSkipReason; value: string }>;
  detectedColumns: string[];
};

type ColumnKey =
  | "name"
  | "firstName"
  | "lastName"
  | "middleName"
  | "phone"
  | "extraPhone"
  | "email"
  | "comment"
  | "birthday";

const columnLabels: Record<ColumnKey, string> = {
  name: "Имя",
  firstName: "Имя",
  lastName: "Фамилия",
  middleName: "Отчество",
  phone: "Телефон",
  extraPhone: "Доп. телефон",
  email: "Email",
  comment: "Комментарий",
  birthday: "Дата рождения",
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
}

// Порядок важен: «дополнительный телефон» должен попасть в extraPhone раньше,
// чем общее правило про «телефон».
function classifyHeader(raw: string): ColumnKey | null {
  const header = normalizeHeader(raw);

  if (!header) return null;
  if (/(доп|дополнит|второй|второго|additional|second)/.test(header) && /(телефон|phone|номер)/.test(header)) {
    return "extraPhone";
  }
  if (/(телефон|phone|мобильн|номер тел|^тел$|^номер$)/.test(header)) return "phone";
  if (/(e ?mail|почта|эл адрес)/.test(header)) return "email";
  if (/(рожден|birth|^др$)/.test(header)) return "birthday";
  if (/(фамилия|last ?name|surname)/.test(header)) return "lastName";
  if (/(отчество|middle ?name|patronymic)/.test(header)) return "middleName";
  if (/^(фио|ф и о|клиент|имя клиента|full ?name|client|name)$/.test(header)) return "name";
  if (/^(имя|first ?name)$/.test(header)) return "firstName";
  if (/(коммент|заметк|примечан|описание|comment|note)/.test(header)) return "comment";

  return null;
}

type ColumnMap = Partial<Record<ColumnKey, number>>;

function detectHeader(rows: SpreadsheetRows): { headerIndex: number; columns: ColumnMap } | null {
  // Заголовок не всегда в первой строке: над таблицей бывает название
  // выгрузки или дата. Смотрим первые 10 строк и берём ту, где есть телефон.
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const columns: ColumnMap = {};

    rows[index].forEach((cell, columnIndex) => {
      const key = classifyHeader(cell);
      if (key && columns[key] === undefined) {
        columns[key] = columnIndex;
      }
    });

    if (columns.phone !== undefined) {
      return { headerIndex: index, columns };
    }
  }

  return null;
}

// Excel любит превращать телефоны в числа: 79781234567 → «7.9781234567E10».
function expandScientific(value: string) {
  const match = value.trim().match(/^(\d)(?:[.,](\d+))?e\+?(\d+)$/i);

  if (!match) {
    return value;
  }

  const [, head, fraction = "", exponentRaw] = match;
  const exponent = Number(exponentRaw);

  return (head + fraction).padEnd(exponent + 1, "0");
}

// Приводим номер к виду формы записи: цифры с кодом страны. Российские
// «8 978…» и «978…» (10 цифр без кода) становятся «7978…» — иначе тот же
// клиент, записавшись сам, получит другой хеш и задвоится.
export function normalizeImportedPhone(raw: string): string | null {
  // В одной ячейке бывает несколько номеров через запятую — берём первый.
  const first = expandScientific(raw).split(/[,;/]|\s{2,}/)[0] ?? "";
  let digits = first.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.length === 10 && digits.startsWith("9")) {
    digits = `7${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) {
    return null;
  }

  return digits;
}

// Дата-ячейка Excel без форматирования приходит серийным числом дней от 1899-12-30.
function formatBirthday(raw: string) {
  const value = raw.trim();

  if (/^\d{4,5}(\.0+)?$/.test(value)) {
    const serial = Number(value);
    if (serial > 1000 && serial < 80_000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      const day = String(date.getUTCDate()).padStart(2, "0");
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      return `${day}.${month}.${date.getUTCFullYear()}`;
    }
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}.${iso[2]}.${iso[1]}`;
  }

  return value;
}

function cellAt(row: string[], index: number | undefined) {
  return index === undefined ? "" : (row[index] ?? "").replace(/\s+/g, " ").trim();
}

function buildName(row: string[], columns: ColumnMap, phone: string) {
  const fullName = cellAt(row, columns.name);
  const composed = [
    cellAt(row, columns.lastName),
    cellAt(row, columns.firstName),
    cellAt(row, columns.middleName),
  ]
    .filter(Boolean)
    .join(" ");
  const name = (fullName || composed).slice(0, 120);

  return name.length >= 2 ? name : `Клиент ···${phone.slice(-4)}`;
}

function buildNotes(row: string[], columns: ColumnMap) {
  const parts: string[] = [];
  const comment = cellAt(row, columns.comment);
  const email = cellAt(row, columns.email);
  const birthday = cellAt(row, columns.birthday);
  const extraPhone = cellAt(row, columns.extraPhone);

  if (comment) parts.push(comment);
  if (birthday) parts.push(`День рождения: ${formatBirthday(birthday)}`);
  if (email) parts.push(`Email: ${email}`);
  if (extraPhone) parts.push(`Доп. телефон: ${extraPhone}`);

  return parts.join("\n").slice(0, CLIENT_IMPORT_NOTES_MAX_LENGTH);
}

export class ClientImportError extends Error {}

export function extractClients(rows: SpreadsheetRows): ClientImportResult {
  const header = detectHeader(rows);

  if (!header) {
    throw new ClientImportError(
      "Не нашли колонку с телефоном. Проверьте, что в первой строке таблицы есть заголовки — например «Имя» и «Телефон».",
    );
  }

  const dataRows = rows.slice(header.headerIndex + 1);

  if (dataRows.length > CLIENT_IMPORT_MAX_ROWS) {
    throw new ClientImportError(
      `В файле больше ${CLIENT_IMPORT_MAX_ROWS.toLocaleString("ru")} строк. Разбейте его на несколько частей.`,
    );
  }

  const clients: ImportedClient[] = [];
  const skipped: ClientImportResult["skipped"] = [];
  const seenPhones = new Set<string>();

  dataRows.forEach((row, offset) => {
    const rowNumber = header.headerIndex + offset + 2;
    const rawPhone = cellAt(row, header.columns.phone);

    if (!rawPhone) {
      skipped.push({ rowNumber, reason: "no_phone", value: buildName(row, header.columns, "") });
      return;
    }

    const phone = normalizeImportedPhone(rawPhone);

    if (!phone) {
      skipped.push({ rowNumber, reason: "bad_phone", value: rawPhone });
      return;
    }

    if (seenPhones.has(phone)) {
      skipped.push({ rowNumber, reason: "duplicate", value: buildName(row, header.columns, phone) });
      return;
    }

    seenPhones.add(phone);
    clients.push({
      name: buildName(row, header.columns, phone),
      phone,
      notes: buildNotes(row, header.columns),
    });
  });

  const detectedColumns = Array.from(
    new Set(
      (Object.keys(header.columns) as ColumnKey[]).map((key) => columnLabels[key]),
    ),
  );

  return { clients, skipped, detectedColumns };
}
