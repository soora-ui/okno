// Регистрация вебхука Unisender Go на события доставки писем.
//
//   node --env-file=.env.local scripts/unisender-webhook-setup.mjs
//   node --env-file=.env.local scripts/unisender-webhook-setup.mjs --list
//   node --env-file=.env.local scripts/unisender-webhook-setup.mjs --delete
//
// Адрес и набор событий хранятся на стороне Unisender Go, поэтому это разовое
// действие на окружение, а не часть деплоя. С --delete вебхук снимается:
// статусы в notification_log перестают обновляться, письма продолжают уходить.

const apiKey = process.env.UNISENDER_GO_API_KEY;
const apiUrl = (
  process.env.UNISENDER_GO_API_URL || "https://goapi.unisender.ru/ru/transactional/api/v1"
).replace(/\/$/, "");
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const mode = process.argv.includes("--delete")
  ? "delete"
  : process.argv.includes("--list")
    ? "list"
    : "set";

if (!apiKey) {
  throw new Error("Нет UNISENDER_GO_API_KEY в окружении.");
}

async function callApi(method, payload) {
  const response = await fetch(`${apiUrl}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify(payload ?? {}),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.status !== "success") {
    throw new Error(
      `${method}: HTTP ${response.status}${data?.code ? ` / код ${data.code}` : ""} — ${
        data?.message ?? "нет описания"
      }`,
    );
  }

  return data;
}

if (mode === "list") {
  const list = await callApi("webhook/list.json", { limit: 50, offset: 0 });
  console.log(JSON.stringify(list, null, 2));
  process.exit(0);
}

if (!appUrl || !appUrl.startsWith("https://")) {
  throw new Error(
    "NEXT_PUBLIC_APP_URL должен быть https-адресом: Unisender Go шлёт вебхуки только по https.",
  );
}

const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/unisender`;

if (mode === "delete") {
  await callApi("webhook/delete.json", { url: webhookUrl });
  console.log(`Вебхук снят: ${webhookUrl}`);
  process.exit(0);
}

await callApi("webhook/set.json", {
  url: webhookUrl,
  status: "active",
  event_format: "json_post",
  // Подробности доставки нужны ради destination_response и delivery_status:
  // без них про hard_bounce известно только то, что он случился.
  delivery_info: 1,
  // Пачками, а не по событию на запрос: меньше запросов — меньше шансов
  // упереться в трёхсекундный таймаут ответа.
  single_event: 0,
  max_parallel: 10,
  events: {
    spam_block: ["*"],
    email_status: [
      "delivered",
      "opened",
      "clicked",
      "unsubscribed",
      "subscribed",
      "soft_bounced",
      "hard_bounced",
      "spam",
    ],
  },
});

console.log(`Вебхук зарегистрирован: ${webhookUrl}`);
console.log(
  "Статусы accepted и sent в подписку не входят — журнал ведёт их сам при отправке.",
);
