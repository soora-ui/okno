// Регистрация вебхука и меню команд бота okno.
//
// Запускать после каждого изменения адреса приложения или секрета вебхука:
//   node --env-file=.env.local scripts/telegram-setup.mjs
//   node --env-file=.env.local scripts/telegram-setup.mjs --delete
//
// Telegram запоминает адрес и секрет у себя, поэтому это разовое действие на
// окружение, а не часть деплоя. С --delete вебхук снимается: бот замолкает.

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const shouldDelete = process.argv.includes("--delete");

if (!token) {
  throw new Error("Нет TELEGRAM_BOT_TOKEN в окружении.");
}

async function callTelegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`${method}: ${data.description ?? response.status}`);
  }

  return data.result;
}

const me = await callTelegram("getMe");
console.log(`Бот: @${me.username} (${me.first_name})`);

if (shouldDelete) {
  await callTelegram("deleteWebhook", { drop_pending_updates: false });
  console.log("Вебхук снят — бот больше не получает апдейты.");
  process.exit(0);
}

if (!secret) {
  throw new Error("Нет TELEGRAM_WEBHOOK_SECRET в окружении.");
}

if (!appUrl || !appUrl.startsWith("https://")) {
  throw new Error(
    "NEXT_PUBLIC_APP_URL должен быть https-адресом: Telegram шлёт вебхуки только по https.",
  );
}

const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;

await callTelegram("setWebhook", {
  url: webhookUrl,
  secret_token: secret,
  // Всё остальное боту не нужно, а лишние апдейты — лишняя нагрузка.
  allowed_updates: ["message", "callback_query", "my_chat_member"],
  max_connections: 20,
});

// Глобальное меню — клиентское. Клиентов на порядок больше, чем мастеров, и
// человек, впервые открывший бота, почти наверняка клиент. Мастерские
// /today, /week и /link ставятся отдельно, на конкретный чат (область chat
// перекрывает глобальную), — этим занимается сам бот при привязке.
const clientCommands = [
  { command: "help", description: "Мои записи" },
  { command: "stop", description: "Больше не напоминать" },
];

const masterCommands = [
  { command: "today", description: "Записи на сегодня" },
  { command: "week", description: "Записи на неделю" },
  { command: "link", description: "Ссылка на страницу записи" },
  { command: "help", description: "Что умеет бот" },
  { command: "stop", description: "Отключить уведомления" },
];

async function applyMasterCommandsToLinkedChats() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.log("Supabase не настроен — мастерские меню проставит бот при /start.");
    return;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/auth_telegram_links?select=chat_id&unlinked_at=is.null&chat_id=not.is.null`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );

  if (!response.ok) {
    console.log("Не получилось прочитать привязки — меню проставит бот при /start.");
    return;
  }

  const rows = await response.json();
  let done = 0;

  for (const row of rows) {
    // Чат мог быть удалён или бот заблокирован: одна такая привязка не должна
    // ронять настройку остальных.
    try {
      await callTelegram("setMyCommands", {
        commands: masterCommands,
        scope: { type: "chat", chat_id: String(row.chat_id) },
      });
      done += 1;
    } catch (error) {
      console.log(`Чат ${row.chat_id}: ${error.message}`);
    }
  }

  console.log(`Мастерское меню проставлено чатам: ${done} из ${rows.length}.`);
}

await callTelegram("setMyCommands", { commands: clientCommands });

// Мастера, привязавшиеся до появления областей, живут с глобальным меню — и
// после смены глобального на клиентское потеряли бы команды кабинета. Бот
// проставит область при следующем /start, но ждать этого не нужно: проходим
// по живым привязкам сразу.
await applyMasterCommandsToLinkedChats();

// Кнопка слева от поля ввода открывает приложение okno вместо списка команд:
// клиент попадает в свои визиты и поиск мастеров, мастер — сразу в кабинет.
// Команды никуда не деваются, они по-прежнему набираются через «/».
await callTelegram("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Открыть",
    web_app: { url: `${appUrl.replace(/\/$/, "")}/tg` },
  },
});

await callTelegram("setMyDescription", {
  description:
    "Бот okno: уведомления о новых записях, напоминания о визитах и расписание под рукой.",
});

const info = await callTelegram("getWebhookInfo");

console.log(`Вебхук: ${info.url}`);
console.log(`Ожидают доставки: ${info.pending_update_count}`);

if (info.last_error_message) {
  console.log(`Последняя ошибка Telegram: ${info.last_error_message}`);
}

console.log("Готово. Команды бота и вебхук зарегистрированы.");
