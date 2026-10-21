// Чтение выгрузок клиентской базы (YCLIENTS, DIKIDI, своя таблица) прямо в
// браузере: .xlsx и .csv в таблицу строк. Без node-импортов и без
// зависимостей — xlsx это zip с XML внутри, его распаковываем сами через
// DecompressionStream. Файл не уходит на сервер целиком: туда едут только
// разобранные имя/телефон/заметка (лимит тела server action — 1 МБ).

export type SpreadsheetRows = string[][];

export class SpreadsheetError extends Error {}

export async function readSpreadsheet(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<SpreadsheetRows> {
  const bytes = new Uint8Array(buffer);
  const extension = fileName.toLowerCase().split(".").pop() ?? "";

  // По сигнатуре, а не по расширению: «.xls» из некоторых CRM на деле xlsx.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return readXlsx(bytes);
  }

  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new SpreadsheetError(
      "Это старый формат Excel (.xls). Откройте файл в Excel или Google Таблицах и сохраните как .xlsx или .csv.",
    );
  }

  if (extension === "xlsx") {
    throw new SpreadsheetError("Файл повреждён или это не таблица Excel.");
  }

  return parseCsv(decodeText(bytes));
}

// ---------- CSV ----------

function decodeText(bytes: Uint8Array) {
  const utf8 = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");

  // Excel под Windows сохраняет CSV в cp1251: в UTF-8 это даёт «�».
  if (utf8.includes("�")) {
    return new TextDecoder("windows-1251").decode(bytes);
  }

  return utf8;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"];

  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

export function parseCsv(text: string): SpreadsheetRows {
  const delimiter = detectDelimiter(text);
  const rows: SpreadsheetRows = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

// ---------- XLSX ----------

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function readZipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;

  // Конец центрального каталога: сигнатура 0x06054b50 в последних ~64 КБ.
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) {
    throw new SpreadsheetError("Файл повреждён или это не таблица Excel.");
  }

  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new SpreadsheetError("Файл повреждён или это не таблица Excel.");
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    entries.set(name, { name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function readZipText(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerOffset = entry.localHeaderOffset;
  const nameLength = view.getUint16(headerOffset + 26, true);
  const extraLength = view.getUint16(headerOffset + 28, true);
  const dataStart = headerOffset + 30 + nameLength + extraLength;
  const data = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) {
    return new TextDecoder().decode(data);
  }

  if (entry.method !== 8) {
    throw new SpreadsheetError("Не получилось распаковать файл Excel.");
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function decodeXmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return match;
  });
}

// Текст внутри <si>/<is>: склеиваем все <t>, включая куски с разным
// форматированием (<r><t>…</t></r>), но без фонетических подсказок <rPh>.
function extractRichText(xml: string) {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";

  for (const match of withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) {
    text += match[1] ?? "";
  }

  return decodeXmlEntities(text);
}

function columnIndexFromRef(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "";
  let index = 0;

  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return index - 1;
}

function getAttribute(tag: string, name: string) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
}

async function readXlsx(bytes: Uint8Array): Promise<SpreadsheetRows> {
  const entries = readZipEntries(bytes);

  // Первый лист берём из workbook.xml.rels — имя файла не всегда sheet1.xml.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbookEntry = entries.get("xl/workbook.xml");
  const relsEntry = entries.get("xl/_rels/workbook.xml.rels");

  if (workbookEntry && relsEntry) {
    const [workbookXml, relsXml] = await Promise.all([
      readZipText(bytes, workbookEntry),
      readZipText(bytes, relsEntry),
    ]);
    const firstSheetTag = workbookXml.match(/<sheet\b[^>]*>/)?.[0];
    const relationId = firstSheetTag ? getAttribute(firstSheetTag, "r:id") : null;

    if (relationId) {
      for (const relation of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
        if (getAttribute(relation[0], "Id") === relationId) {
          const target = getAttribute(relation[0], "Target") ?? "";
          sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
          break;
        }
      }
    }
  }

  const sheetEntry = entries.get(sheetPath);

  if (!sheetEntry) {
    throw new SpreadsheetError("В файле Excel не нашлось листа с данными.");
  }

  const sharedStringsEntry = entries.get("xl/sharedStrings.xml");
  const [sheetXml, sharedStringsXml] = await Promise.all([
    readZipText(bytes, sheetEntry),
    sharedStringsEntry ? readZipText(bytes, sharedStringsEntry) : Promise.resolve(""),
  ]);
  const sharedStrings = Array.from(sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map(
    (match) => extractRichText(match[1]),
  );

  const rows: SpreadsheetRows = [];

  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    let nextColumn = 0;

    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = ` ${cellMatch[1]}`;
      const body = cellMatch[2] ?? "";
      const ref = getAttribute(attributes, "r");
      const column = ref ? columnIndexFromRef(ref) : nextColumn;
      const type = getAttribute(attributes, "t");
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";

      if (type === "s" && rawValue !== undefined) {
        value = sharedStrings[Number(rawValue)] ?? "";
      } else if (type === "inlineStr") {
        value = extractRichText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      } else if (rawValue !== undefined) {
        value = decodeXmlEntities(rawValue);
      }

      while (row.length < column) {
        row.push("");
      }
      row[column] = value;
      nextColumn = column + 1;
    }

    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}
