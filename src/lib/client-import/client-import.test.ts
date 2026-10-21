import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractClients, normalizeImportedPhone } from "@/lib/client-import/parse";
import { parseCsv, readSpreadsheet } from "@/lib/client-import/spreadsheet";

// Минимальный zip (deflate) — ровно то, что пишет Excel, без лишнего.
function buildZip(files: Record<string, string>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(content));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(content), 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(content), 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }

  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);

  const zip = Buffer.concat([...locals, centralBytes, end]);
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
}

describe("normalizeImportedPhone", () => {
  it("приводит российские номера к виду формы записи", () => {
    expect(normalizeImportedPhone("+7 (978) 123-45-67")).toBe("79781234567");
    expect(normalizeImportedPhone("8 978 123 45 67")).toBe("79781234567");
    expect(normalizeImportedPhone("9781234567")).toBe("79781234567");
    expect(normalizeImportedPhone("7.9781234567E10")).toBe("79781234567");
    expect(normalizeImportedPhone("375291234567")).toBe("375291234567");
    expect(normalizeImportedPhone("79781234567, 79990000000")).toBe("79781234567");
    expect(normalizeImportedPhone("12345")).toBeNull();
  });
});

describe("extractClients", () => {
  it("разбирает шаблон YCLIENTS и складывает доп. поля в заметку", () => {
    const result = extractClients([
      ["Имя", "Телефон", "Дополнительный телефон", "Email", "Комментарий", "Дата рождения", "Пол"],
      ["Анна", "79781234567", "", "anna@mail.ru", "Аллергия на гель", "33000", "Женский"],
      ["Мария", "89781112233", "79990001122", "", "", "", ""],
      ["Повтор", "+7 978 123-45-67", "", "", "", "", ""],
      ["Без телефона", "", "", "", "", "", ""],
      ["Кривой", "123", "", "", "", "", ""],
    ]);

    expect(result.clients).toEqual([
      {
        name: "Анна",
        phone: "79781234567",
        notes: "Аллергия на гель\nДень рождения: 07.05.1990\nEmail: anna@mail.ru",
      },
      { name: "Мария", phone: "79781112233", notes: "Доп. телефон: 79990001122" },
    ]);
    expect(result.skipped.map((item) => item.reason)).toEqual(["duplicate", "no_phone", "bad_phone"]);
    expect(result.detectedColumns).toContain("Телефон");
  });

  it("находит заголовок ниже первой строки и собирает ФИО из частей", () => {
    const result = extractClients([
      ["Выгрузка клиентов от 01.10.2026"],
      ["Фамилия", "Имя", "Отчество", "Мобильный телефон"],
      ["Иванова", "Ольга", "Петровна", "+79780000001"],
    ]);

    expect(result.clients[0]).toMatchObject({ name: "Иванова Ольга Петровна", phone: "79780000001" });
  });

  it("без колонки телефона — понятная ошибка", () => {
    expect(() => extractClients([["Имя", "Email"], ["Анна", "a@b.c"]])).toThrow(/телефон/);
  });
});

describe("readSpreadsheet", () => {
  it("читает CSV с ; и кавычками", async () => {
    expect(parseCsv('Имя;Телефон\r\n"Анна; ""Кудри""";79781234567\r\n')).toEqual([
      ["Имя", "Телефон"],
      ['Анна; "Кудри"', "79781234567"],
    ]);
  });

  it("читает CSV в cp1251", async () => {
    // «Имя,Телефон\nОля,79781234567» в windows-1251.
    const bytes = new Uint8Array([
      0xc8, 0xec, 0xff, 0x2c, 0xd2, 0xe5, 0xeb, 0xe5, 0xf4, 0xee, 0xed, 0x0a, 0xce, 0xeb, 0xff, 0x2c,
      ...Buffer.from("79781234567"),
    ]);
    const rows = await readSpreadsheet(bytes.buffer, "clients.csv");
    expect(rows).toEqual([["Имя", "Телефон"], ["Оля", "79781234567"]]);
  });

  it("читает xlsx: общие строки, числа и пропуски ячеек", async () => {
    const buffer = buildZip({
      "xl/workbook.xml":
        '<workbook><sheets><sheet name="Клиенты" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/data.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        '<sst><si><t>Имя</t></si><si><t>Телефон</t></si><si><r><t>Анна </t></r><r><t>&amp; Ко</t></r></si><si><t>Комментарий</t></si></sst>',
      "xl/worksheets/data.xml":
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>3</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>79781234567</v></c><c r="D2" t="inlineStr"><is><t>VIP</t></is></c></row>' +
        "</sheetData></worksheet>",
    });

    const rows = await readSpreadsheet(buffer, "export.xlsx");
    expect(rows).toEqual([
      ["Имя", "Телефон", "", "Комментарий"],
      ["Анна & Ко", "79781234567", "", "VIP"],
    ]);
    expect(extractClients(rows).clients).toEqual([
      { name: "Анна & Ко", phone: "79781234567", notes: "VIP" },
    ]);
  });

  it("старый .xls — просим пересохранить", async () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    await expect(readSpreadsheet(bytes.buffer, "old.xls")).rejects.toThrow(/xlsx/);
  });
});
