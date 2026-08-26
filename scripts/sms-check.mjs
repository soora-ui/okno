// Проверка: доходит ли SMS с общего отправителя sms.ru, без платного имени.
//
//   npm run sms:check                    — только баланс и список имён, без отправки
//   npm run sms:check -- 79781234567     — отправляет реальное SMS и ждёт статус доставки
//
// Зачем: имя отправителя на большой тройке стоит ~6 670 ₽/мес абонплаты
// (Мегафон 2550 + МТС 2040 + Билайн 2080), Крым — ещё 8 000. Но это цена
// ИМЕНИ, а не доставки: без параметра from sms.ru отправляет с общего
// отправителя, и абонплаты за это нет. Работает ли такая отправка на самом
// деле — вопрос фактический, этот скрипт на него отвечает за ~4 ₽.
//
// Отправка идёт БЕЗ from намеренно. Если задать SMSRU_FROM, тест проверит
// другое (доставку от имени), поэтому скрипт в этом случае откажется работать.

const apiId = process.env.SMSRU_API_ID;
const to = normalizePhone(process.argv[2] ?? "");

if (!apiId) {
  throw new Error(
    [
      "Нет SMSRU_API_ID в окружении.",
      "Ключ здесь: https://sms.ru/?panel=api → добавь строкой SMSRU_API_ID=... в .env.local",
    ].join("\n"),
  );
}

// Обе переменные ломают смысл проверки, поэтому падаем сразу, а не после
// списания денег с баланса.
if (process.env.SMSRU_FROM) {
  throw new Error(
    [
      `Задан SMSRU_FROM=${process.env.SMSRU_FROM} — с ним проверка бессмысленна.`,
      "Смысл теста в отправке БЕЗ имени отправителя. Закомментируй переменную в .env.local.",
    ].join("\n"),
  );
}

if (process.env.SMSRU_TEST_MODE === "1") {
  throw new Error(
    [
      "Задан SMSRU_TEST_MODE=1 — sms.ru имитирует отправку и ничего не доставляет.",
      "Нам нужна именно реальная доставка. Убери переменную из .env.local.",
    ].join("\n"),
  );
}

// sms.ru принимает номер без "+": 79780000000. Та же нормализация, что в
// src/lib/sms.ts — чтобы тест ходил тем же путём, что и приложение.
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }

  return digits;
}

async function callApi(method, params) {
  const body = new URLSearchParams({ api_id: apiId, json: "1", ...params });
  const response = await fetch(`https://sms.ru/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`${method}: HTTP ${response.status}`);
  }

  return response.json();
}

// Коды отправки sms.ru. 204 — то самое «имя отправителя не согласовано»:
// если он придёт при отправке без from, значит бесплатного пути нет.
function explainSendCode(code, text) {
  const hints = {
    100: "принято к отправке",
    201: "не хватает средств на балансе",
    202: "неправильно указан получатель",
    203: "нет текста сообщения",
    204: "оператор не подключён к имени отправителя — отправка невозможна",
    205: "сообщение слишком длинное",
    206: "превышен дневной лимит",
    207: "на этот номер отправлять нельзя",
    209: "номер в стоп-листе",
    230: "превышен лимит на этот номер",
  };

  return `код ${code} — ${hints[code] ?? text ?? "нет описания"}`;
}

// Статусы доставки. 103 — доставлено, всё остальное финальное — нет.
const deliveryStatuses = {
  100: { label: "принято к отправке", final: false },
  101: { label: "передаётся оператору", final: false },
  102: { label: "отправлено, в пути", final: false },
  103: { label: "ДОСТАВЛЕНО", final: true, ok: true },
  104: { label: "не доставлено: истёк срок жизни", final: true },
  105: { label: "удалено оператором", final: true },
  106: { label: "сбой в телефоне", final: true },
  107: { label: "не доставлено, причина неизвестна", final: true },
  108: { label: "отклонено", final: true },
  150: { label: "не доставлено: номер в стоп-листе", final: true },
};

// 1. Баланс — заодно проверяет, что ключ рабочий.
const balance = await callApi("my/balance", {});

if (balance.status !== "OK") {
  throw new Error(`my/balance: ${explainSendCode(balance.status_code, balance.status_text)}`);
}

const balanceBefore = Number(balance.balance);

console.log(`Ключ принят. Баланс: ${balanceBefore} ₽`);

// 2. Какие имена вообще согласованы. Если список пуст — тем интереснее
// результат отправки: значит уходить будет точно с общего отправителя.
const senders = await callApi("my/senders", {}).catch(() => null);

if (senders?.status === "OK") {
  const list = senders.senders ?? [];
  console.log(
    list.length > 0
      ? `Согласованные имена отправителя: ${list.join(", ")}`
      : "Согласованных имён отправителя нет — отправка пойдёт с общего.",
  );
}

if (!to) {
  console.log("\nНомер не передан — ничего не отправляю.");
  console.log("Запуск с отправкой: npm run sms:check -- 79161234567");
  process.exit(0);
}

// Крымские операторы (Волна, Win mobile) — единственные, где имя отправителя
// покупает саму доставку, а не бренд. Проверять на них общий отправитель
// бессмысленно: 22.08.2026 такая отправка списала 7,40 ₽ и отчиталась
// статусом 103, а SMS не пришла. Поэтому предупреждаем до списания.
if (to.startsWith("7978") && !process.argv.includes("--force")) {
  throw new Error(
    [
      "+7 978 — крымский номер (Волна, Win mobile, МТС Крым), отправка остановлена.",
      "",
      "Там общий отправитель не работает, а sms.ru всё равно списывает деньги",
      "и отдаёт статус 103 «доставлено». Проверено дважды 22.08.2026: 7,40 ₽ за",
      "сообщение, отчёт через 4 секунды, SMS не пришла ни разу.",
      "",
      "Для проверки бесплатного пути нужен материковый номер: Мегафон, МТС,",
      "Билайн или Т2. Если всё-таки надо повторить на крымском — добавь --force.",
    ].join("\n"),
  );
}

// 3. Сколько будет стоить. sms/cost денег не списывает и заодно показывает,
// как sms.ru определил оператора получателя.
const message = "okno: проверка доставки. Это тестовое сообщение, отвечать не нужно.";
const cost = await callApi("sms/cost", { to, msg: message });

const perNumberCost = cost.sms?.[to] ?? {};

if (cost.total_cost !== undefined) {
  console.log(`\nСтоимость отправки на ${to}: ${cost.total_cost} ₽ (${cost.total_sms} SMS)`);
} else {
  // Стоимости нет — значит оператор недоступен для отправки. Код лежит либо
  // в ответе по номеру, либо в общем статусе.
  const code = perNumberCost.status_code ?? cost.status_code;
  console.log(`\nСтоимость посчитать не удалось: ${explainSendCode(code, cost.status_text)}`);
}

// 4. Отправка. Параметр from не задаётся — в этом весь смысл проверки.
console.log("Отправляю без имени отправителя...");

const sent = await callApi("sms/send", { to, msg: message });
const perNumber = sent.sms?.[to] ?? {};

if (sent.status !== "OK" || perNumber.status !== "OK") {
  const code = perNumber.status_code ?? sent.status_code;
  const text = perNumber.status_text ?? sent.status_text;

  console.log(`\nОтправка отклонена: ${explainSendCode(code, text)}`);

  if (code === 204) {
    console.log(
      [
        "",
        "Без подключённого имени отправителя SMS этому оператору не уходят вовсе.",
        "Деньги при этом не списываются — отказ чистый, до тарификации.",
        "",
        "Подключение имени к оператору стоит абонплату: Мегафон 2550, МТС 2040,",
        "Билайн 2080 ₽/мес. Бесплатно имя подключается только к Т2, СберМобайлу",
        "и МОТИВу: https://sms.ru/?panel=senders",
      ].join("\n"),
    );
  }

  process.exit(1);
}

const smsId = perNumber.sms_id;
console.log(`Принято sms.ru. sms_id: ${smsId}`);
console.log("Жду финальный статус доставки (до 3 минут)...\n");

// 5. Приём в очередь ещё ничего не значит — доставку показывает только
// sms/status. Опрашиваем, пока статус не станет финальным.
const deadline = Date.now() + 3 * 60 * 1000;
let last = null;

while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 10_000));

  const status = await callApi("sms/status", { sms_id: smsId });
  const code = status.sms?.[smsId]?.status_code;
  const info = deliveryStatuses[code];

  if (code !== last) {
    console.log(`  ${info?.label ?? `неизвестный статус ${code}`}`);
    last = code;
  }

  if (info?.final) {
    if (!info.ok) {
      console.log("\nДоставки нет. Причина — в истории: https://sms.ru/?panel=history");
      process.exit(1);
    }

    // Статус 103 не равен «дошло». На дорогих маршрутах отчёт о доставке
    // приходит от промежуточного узла, а не с телефона: деньги списываются,
    // статус положительный, сообщения нет. Признаки такого отчёта — почти
    // нулевая задержка и завышенная цена, поэтому печатаем оба числа.
    const latency = status.sms[smsId].status_time - status.sms[smsId].send_time;
    const spent = status.sms[smsId].cost;
    const after = await callApi("my/balance", {}).catch(() => null);

    console.log("");
    console.log(`sms.ru отчитался о доставке за ${latency} с. Списано: ${spent} ₽.`);

    if (after?.status === "OK") {
      console.log(`Баланс: ${balanceBefore} → ${after.balance} ₽`);
    }

    console.log("");
    console.log("ЭТО ЕЩЁ НЕ ОТВЕТ. Возьми телефон и посмотри, пришла ли SMS.");
    console.log("");
    console.log("  пришла      → бесплатный путь на этого оператора работает,");
    console.log("                абонплата за имя не нужна. Заодно посмотри поле");
    console.log("                «От кого» — это то, что увидит клиент мастера.");
    console.log("  не пришла   → отчёт о доставке недостоверен. Проверь в истории,");
    console.log("                какое имя отправителя реально ушло:");
    console.log("                https://sms.ru/?panel=history");

    process.exit(0);
  }
}

console.log(
  [
    "",
    "За 3 минуты финального статуса не пришло — это ещё не отказ, SMS может идти дольше.",
    `Досмотри вручную: https://sms.ru/?panel=history (sms_id ${smsId})`,
  ].join("\n"),
);
