// Диагностика транзакционной почты Unisender Go.
//
//   node --env-file=.env.local scripts/test-email.mjs support@okno.business
//   npm run email:test -- support@okno.business
//
// Ходит в API напрямую, минуя приложение: если что-то не так с ключом или
// доменом, это видно до того, как искать причину в коде. Письмо отсюда —
// минимальное, «настоящий» шаблон уходит через POST /api/email/test.
//
// Первую проверку делай на свой домен (support@okno.business). Отправка на
// случайные внешние адреса портит репутацию домена с первого дня.

const apiKey = process.env.UNISENDER_GO_API_KEY;
const apiUrl = (
  process.env.UNISENDER_GO_API_URL || "https://goapi.unisender.ru/ru/transactional/api/v1"
).replace(/\/$/, "");
const fromEmail = process.env.EMAIL_FROM;
const fromName = process.env.EMAIL_FROM_NAME;
const replyTo = process.env.EMAIL_REPLY_TO;
const to = process.argv[2];

if (!apiKey) {
  throw new Error("Нет UNISENDER_GO_API_KEY в окружении.");
}

// EMAIL_FROM проверяется ниже, перед самой отправкой: ping и список доменов
// адрес отправителя не используют, и запуск без него должен работать — это
// первое, что делаешь, когда ключ только получен.

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
      }${hintForCode(data?.code)}`,
    );
  }

  return data;
}

// Коды, за которыми стоит не ошибка в запросе, а ненастроенный аккаунт: без
// подсказки на них уходит полдня раскопок в документации.
function hintForCode(code) {
  if (code === 229 || code === 230) {
    return [
      "",
      "",
      "Отправка заблокирована, пока у аккаунта нет домена ссылок (домена трекинга).",
      "Unisender Go по умолчанию переписывает ссылки на трекинговые, а переписывать их не на что.",
      "Настройки → Домены ссылок → «+» → link.mail.okno.business, внести выданные DNS-записи",
      "и дождаться статуса «Настроен» (до 48 часов).",
    ].join("\n");
  }

  if (code === 206 || code === 1574) {
    return "\n\nАдрес отправителя не на подтверждённом домене. Проверь EMAIL_FROM.";
  }

  return "";
}

// 1. Ключ валиден?
await callApi("system/ping.json", {});
console.log("Ключ API принят.");

// 2. Домены и их статусы. Отправлять можно только с домена, у которого запись
// владения confirmed, а DKIM active.
const domains = await callApi("domain/list.json", {});

for (const domain of domains.domains ?? []) {
  const verification = domain["verification-record"]?.status ?? "—";
  const dkim = domain.dkim?.status ?? "—";
  const ready = verification === "confirmed" && dkim === "active" ? "готов" : "не готов";

  console.log(`Домен ${domain.domain}: владение ${verification}, DKIM ${dkim} — ${ready}.`);
}

if (!to) {
  console.log("\nАдрес получателя не передан — письмо не отправляю.");
  console.log("Запуск с отправкой: npm run email:test -- support@okno.business");
  process.exit(0);
}

// 3. Отправка.
if (!fromEmail) {
  throw new Error(
    "Нет EMAIL_FROM в окружении — отправлять не с чего. Адрес должен быть на подтверждённом домене.",
  );
}

const sentAt = new Date().toISOString();
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body>
<p style="font-family:Arial,sans-serif;font-size:15px;color:#1c1a17;">Диагностическое письмо okno.business.</p>
<p style="font-family:Arial,sans-serif;font-size:15px;color:#4a453e;">Отправлено скриптом scripts/test-email.mjs, ${sentAt}.</p>
</body></html>`;

const result = await callApi("email/send.json", {
  message: {
    recipients: [{ email: to, metadata: { email_type: "test" } }],
    body: {
      html,
      plaintext: `Диагностическое письмо okno.business.\nОтправлено скриптом scripts/test-email.mjs, ${sentAt}.`,
    },
    subject: "Проверка отправки писем okno.business",
    from_email: fromEmail,
    ...(fromName ? { from_name: fromName } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    template_engine: "simple",
    tags: ["test"],
  },
});

console.log(`\nПисьмо принято в очередь. job_id: ${result.job_id}`);
console.log(`Приняты адреса: ${(result.emails ?? []).join(", ") || "—"}`);

const failed = result.failed_emails ?? {};

if (Object.keys(failed).length > 0) {
  console.log("Не приняты адреса:");

  for (const [email, reason] of Object.entries(failed)) {
    console.log(`  ${email}: ${reason}`);
  }
} else {
  console.log("Отклонённых адресов нет.");
}

console.log(
  "\nHTTP 200 означает только приём в очередь. Доставку покажет вебхук и строка в notification_log.",
);
