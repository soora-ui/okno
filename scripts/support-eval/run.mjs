// Прогон набора проверок AI-поддержки (scripts/support-eval/cases.json).
//
// Зачем: промпт, карту тем и код вокруг модели правят руками, и любая правка
// может тихо сломать то, что работало («чуть поправил тон» — и бот снова
// советует конкурентов). Прогон перед каждым изменением и после деплоя
// показывает это сразу.
//
// Запуск:
//   npm run eval:support                                  — локальный сервер
//   npm run eval:support -- --url https://okno.business  — прод (гостем)
//   npm run eval:support -- --only leak-repeat,dan        — отдельные кейсы
//
// Каждый кейс — вызов модели, то есть деньги (~25 запросов на прогон).
// Запросы идут гостем, без кук: эскалации живым операторам не создаются.
// Пауза между запросами держит в рамках лимита 10 запросов в минуту на IP.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { url: "http://localhost:3000", delayMs: 7000, only: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--url") args.url = value.replace(/\/$/, "");
    else if (key === "--delay") args.delayMs = Number(value);
    else if (key === "--only") args.only = new Set(value.split(","));
    else if (key === "--out") args.out = value;
    else continue;
    i += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const suite = JSON.parse(readFileSync(path.join(here, "cases.json"), "utf8"));
const cases = suite.cases.filter((item) => !args.only || args.only.has(item.id));
const endpoint = `${args.url}/api/support-chat`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const regex = (source) => new RegExp(source, "iu");

let requestCount = 0;

async function ask(body) {
  if (requestCount > 0) await sleep(args.delayMs);
  requestCount += 1;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Тело не JSON — например, страница ошибки Cloudflare.
    }
    if (response.status === 429) {
      await sleep(61_000);
      continue;
    }
    return { status: response.status, data, raw: data ? null : text.slice(0, 200) };
  }
  return { status: 429, data: null, raw: "rate limited" };
}

async function runCase(item) {
  const history = [...(item.history ?? [])];
  const steps = item.steps ?? [item.message];
  let result = null;

  for (const [index, message] of steps.entries()) {
    result = await ask({
      message,
      history,
      isFirstMessageToday: index === 0 ? Boolean(item.isFirstMessageToday) : false,
    });
    if (!result.data?.reply) break;
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: result.data.reply, sig: result.data.sig });
  }

  const reply = result.data?.reply ?? "";
  const failures = [];

  if (result.status !== 200) failures.push(`HTTP ${result.status}`);
  if (!reply) failures.push(`нет ответа: ${result.data?.error ?? result.raw ?? "пусто"}`);

  if (reply) {
    for (const source of item.mustMatch ?? []) {
      if (!regex(source).test(reply)) failures.push(`нет совпадения с /${source}/`);
    }
    for (const source of [...suite.globalMustNotMatch, ...(item.mustNotMatch ?? [])]) {
      const match = reply.match(regex(source));
      if (match) failures.push(`запрещённое «${match[0]}» (/${source}/)`);
    }
    if (item.maxChars && reply.length > item.maxChars) {
      failures.push(`длина ${reply.length} > ${item.maxChars}`);
    }
    if (item.expectSuggestions && !(result.data?.suggestions?.length > 0)) {
      failures.push("ожидались варианты уточнения");
    }
  }

  return { id: item.id, group: item.group, passed: failures.length === 0, failures, reply };
}

console.log(`Прогон ${cases.length} кейсов → ${endpoint}\n`);
const results = [];
for (const item of cases) {
  const result = await runCase(item);
  results.push(result);
  const mark = result.passed ? "✓" : "✗";
  console.log(`${mark} ${result.id} [${result.group}]`);
  if (!result.passed) {
    for (const failure of result.failures) console.log(`    – ${failure}`);
    console.log(`    ответ: ${result.reply.replace(/\s+/g, " ").slice(0, 220)}`);
  }
}

const passed = results.filter((item) => item.passed).length;
console.log(`\nИтого: ${passed}/${results.length}`);

if (args.out) {
  writeFileSync(args.out, JSON.stringify({ endpoint, at: new Date().toISOString(), results }, null, 2));
  console.log(`Ответы целиком: ${args.out}`);
}

process.exit(passed === results.length ? 0 : 1);
