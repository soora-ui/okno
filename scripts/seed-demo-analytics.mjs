// Демо-аккаунты с историей записей — витрина и проверка аналитики на боевой базе.
//
//   node scripts/seed-demo-analytics.mjs --config demo.json   создать
//   node scripts/seed-demo-analytics.mjs --delete              удалить всё демо
//
// Запускается на сервере из каталога приложения: берёт .env (адрес Supabase,
// сервисный ключ, PHONE_ENCRYPTION_SECRET) и node_modules приложения.
// demo.json: { "password": "..." } — общий пароль демо-аккаунтов.
//
// Безопасность для прода:
// - username начинается с «demo-»: такие страницы закрыты от поиска и не
//   попадают в sitemap (src/lib/reserved-usernames.ts);
// - почта на зарезервированном домене .test, телефоны клиентов +7 000…:
//   ни письма, ни SMS не уйдут;
// - записи пишутся напрямую, мимо кода записи, поэтому очередь уведомлений
//   (notification_events) пуста; Telegram не подключён; автоплатёж выключен.
// Удаление ищет профили сразу по двум признакам: username «demo-» и почта @okno.test.

import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

const ZONE = "Europe/Moscow";
const EMAIL_DOMAIN = "okno.test";
const DAYS_BACK = 92;
const DAYS_AHEAD = 14;

const isDryRun = process.argv.includes("--dry-run");
const env = isDryRun
  ? { PHONE_ENCRYPTION_SECRET: "dry-run" }
  : Object.fromEntries(
      readFileSync(".env", "utf8")
        .split("\n")
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index),
            line
              .slice(index + 1)
              .trim()
              .replace(/^(["'])(.*)\1$/, "$2"),
          ];
        }),
    );

const db = isDryRun
  ? null
  : createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

// --- телефоны: так же, как src/lib/booking.ts ---------------------------------
const phoneKey = createHash("sha256")
  .update(env.PHONE_ENCRYPTION_SECRET)
  .digest();
function encryptPhone(phone) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", phoneKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(phone, "utf8"),
    cipher.final(),
  ]);
  return [
    "enc1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}
const hashPhone = (phone) =>
  createHash("sha256")
    .update(`${env.PHONE_ENCRYPTION_SECRET}:${phone}`)
    .digest("hex");

// --- детерминированный случай: одинаковые данные при каждом запуске ------------
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (random, items) => items[Math.floor(random() * items.length)];
function weighted(random, pairs) {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

// --- кто есть кто ------------------------------------------------------------
// raise: услуга подорожала daysAgo дней назад; старые записи хранят прежнюю цену.
const MASTERS = [
  {
    key: "solo",
    username: "demo-anna-nails",
    fullName: "Анна Смирнова",
    specialty: "Маникюр и педикюр",
    role: "solo",
    workspace: { name: "Анна Смирнова", kind: "solo" },
    tier: "solo-plus",
    seed: 11,
    perDay: [3, 5],
    schedule: {
      1: ["10:00", "20:00"],
      2: ["10:00", "20:00"],
      3: ["10:00", "20:00"],
      4: ["10:00", "20:00"],
      5: ["10:00", "20:00"],
      6: ["11:00", "18:00"],
    },
    clientsCount: 70,
    services: [
      {
        title: "Маникюр с покрытием",
        minutes: 120,
        price: 2500,
        buffer: 15,
        raise: { from: 2200, daysAgo: 45 },
      },
      { title: "Маникюр без покрытия", minutes: 60, price: 1500, buffer: 15 },
      { title: "Педикюр с покрытием", minutes: 120, price: 3200, buffer: 15 },
      { title: "Снятие и укрепление", minutes: 45, price: 900, buffer: 10 },
      { title: "Сложный дизайн", minutes: 150, price: 3800, buffer: 15 },
      {
        title: "Наращивание ногтей",
        minutes: 180,
        price: 4500,
        buffer: 20,
        prepayment: 1000,
      },
    ],
  },
  {
    key: "studio-admin",
    username: "demo-studio-lumiere",
    fullName: "Ольга Белова",
    specialty: "Брови и ресницы",
    role: "admin",
    workspace: { name: "Студия «Люмьер»", kind: "studio" },
    tier: "studio",
    seed: 21,
    perDay: [2, 4],
    schedule: {
      2: ["10:00", "19:00"],
      3: ["10:00", "19:00"],
      4: ["10:00", "19:00"],
      5: ["10:00", "19:00"],
    },
    clientsCount: 45,
    services: [
      {
        title: "Коррекция и окрашивание бровей",
        minutes: 60,
        price: 1800,
        buffer: 15,
      },
      { title: "Ламинирование ресниц", minutes: 90, price: 2600, buffer: 15 },
      {
        title: "Наращивание ресниц 2D",
        minutes: 150,
        price: 3500,
        buffer: 15,
        prepayment: 800,
      },
    ],
  },
  {
    key: "studio-irina",
    username: "demo-studio-irina",
    fullName: "Ирина Котова",
    specialty: "Парикмахер-стилист",
    role: "staff",
    seed: 31,
    perDay: [3, 5],
    schedule: {
      1: ["10:00", "20:00"],
      2: ["10:00", "20:00"],
      4: ["10:00", "20:00"],
      5: ["10:00", "20:00"],
      6: ["10:00", "17:00"],
    },
    clientsCount: 65,
    services: [
      { title: "Женская стрижка", minutes: 60, price: 2200, buffer: 15 },
      {
        title: "Окрашивание в один тон",
        minutes: 150,
        price: 5500,
        buffer: 20,
        raise: { from: 4900, daysAgo: 30 },
      },
      { title: "Укладка", minutes: 45, price: 1500, buffer: 10 },
      {
        title: "Сложное окрашивание",
        minutes: 240,
        price: 9800,
        buffer: 20,
        prepayment: 2000,
      },
    ],
  },
  {
    key: "studio-maria",
    username: "demo-studio-maria",
    fullName: "Мария Лебедева",
    specialty: "Косметолог",
    role: "staff",
    seed: 41,
    perDay: [2, 4],
    schedule: {
      1: ["11:00", "20:00"],
      3: ["11:00", "20:00"],
      5: ["11:00", "20:00"],
      6: ["11:00", "17:00"],
    },
    clientsCount: 40,
    services: [
      { title: "Чистка лица", minutes: 90, price: 3500, buffer: 15 },
      { title: "Пилинг", minutes: 60, price: 2800, buffer: 15 },
      { title: "Массаж лица", minutes: 45, price: 2000, buffer: 10 },
    ],
  },
  {
    key: "studio-kirill",
    username: "demo-studio-kirill",
    fullName: "Кирилл Орлов",
    specialty: "Барбер",
    role: "staff",
    seed: 51,
    perDay: [5, 8],
    schedule: {
      2: ["12:00", "21:00"],
      3: ["12:00", "21:00"],
      4: ["12:00", "21:00"],
      5: ["12:00", "21:00"],
      6: ["11:00", "19:00"],
      7: ["11:00", "17:00"],
    },
    clientsCount: 80,
    services: [
      { title: "Мужская стрижка", minutes: 45, price: 1600, buffer: 10 },
      { title: "Стрижка и борода", minutes: 75, price: 2400, buffer: 10 },
      { title: "Моделирование бороды", minutes: 30, price: 1000, buffer: 10 },
    ],
  },
];

const FIRST_NAMES = [
  "Анастасия",
  "Елена",
  "Мария",
  "Ольга",
  "Татьяна",
  "Наталья",
  "Ирина",
  "Светлана",
  "Юлия",
  "Екатерина",
  "Дарья",
  "Полина",
  "Виктория",
  "Ксения",
  "Алина",
  "Вероника",
  "София",
  "Алексей",
  "Дмитрий",
  "Сергей",
  "Андрей",
  "Максим",
  "Иван",
  "Артём",
  "Никита",
  "Павел",
];
const LAST_INITIALS = "АБВГДЕЖЗИКЛМНОПРСТУФХЧШЭЮЯ".split("");
const SOURCES = [
  ["instagram", 30],
  ["telegram", 18],
  ["vk", 12],
  ["yandex_maps", 14],
  ["twogis", 8],
  ["avito", 6],
  ["search", 7],
  ["whatsapp", 5],
  [null, 10],
];
const REVIEWS = {
  5: [
    "Всё отлично, приду ещё!",
    "Лучший мастер, спасибо!",
    "Очень аккуратно и быстро.",
    "Как всегда идеально.",
    "Уютно, вежливо, результат супер.",
  ],
  4: [
    "Хорошо, но немного задержались по времени.",
    "Результат нравится, цена чуть высоковата.",
    "Всё хорошо, хотелось бы больше вариантов дизайна.",
  ],
  3: ["Нормально, но ждала минут 20.", "Средне, в прошлый раз было лучше."],
  2: [
    "Покрытие отслоилось через неделю.",
    "Опоздали на полчаса и не предупредили.",
  ],
  1: [
    "Ужасно, пришлось переделывать у другого мастера.",
    "Записали на время, а мастер был занят. Больше не приду.",
  ],
};

// --- генерация ---------------------------------------------------------------
// Записи начинаются на :00 или :30, как в сетке записи.
function roundUpToHalfHour(time) {
  const base = time.startOf("hour");
  if (time.equals(base) || time.equals(base.plus({ minutes: 30 }))) return time;
  return time < base.plus({ minutes: 30 })
    ? base.plus({ minutes: 30 })
    : base.plus({ hours: 1 });
}

// Та же проверка, что исключающее ограничение bookings_no_overlap_excl в базе:
// занятые интервалы (до busy_until) действующих записей мастера не пересекаются.
function assertNoOverlap(master) {
  const active = master.bookings
    .filter((item) => item.status === "confirmed")
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
  for (let index = 1; index < active.length; index += 1) {
    if (active[index].start < active[index - 1].busyUntil) {
      throw new Error(
        `${master.username}: пересечение записей ${active[index - 1].start.toISO()} и ${active[index].start.toISO()}`,
      );
    }
  }
}
function buildMaster(master, now) {
  const random = rng(master.seed);
  const profileId = randomUUID();
  const services = master.services.map((service, index) => ({
    ...service,
    id: randomUUID(),
    sortOrder: index + 1,
  }));

  const clients = Array.from({ length: master.clientsCount }, (_, index) => {
    const phone = `7000${String(master.seed).padStart(2, "0")}${String(index).padStart(5, "0")}`;
    return {
      id: randomUUID(),
      name: `${pick(random, FIRST_NAMES)} ${pick(random, LAST_INITIALS)}.`,
      phone,
      // Постоянные приходят чаще: так появляются и повторные визиты, и «давно не были».
      weight:
        index < master.clientsCount * 0.3
          ? 6
          : index < master.clientsCount * 0.6
            ? 2
            : 1,
    };
  });

  const blocked = [];
  // Отпуск неделю назад и выходной «по делам» месяц назад — проверка загрузки.
  const vacationStart = now.startOf("day").minus({ days: 60 });
  blocked.push({
    id: randomUUID(),
    startsAt: vacationStart,
    endsAt: vacationStart.plus({ days: 3 }),
    reason: "Отпуск",
  });
  const dayOff = now.startOf("day").minus({ days: 20 }).set({ hour: 10 });
  blocked.push({
    id: randomUUID(),
    startsAt: dayOff,
    endsAt: dayOff.plus({ hours: 4 }),
    reason: "Личные дела",
  });
  const isBlocked = (from, to) =>
    blocked.some((slot) => from < slot.endsAt && to > slot.startsAt);

  const bookings = [];
  const firstDay = now.startOf("day").minus({ days: DAYS_BACK });
  const lastDay = now.startOf("day").plus({ days: DAYS_AHEAD });

  for (let day = firstDay; day <= lastDay; day = day.plus({ days: 1 })) {
    const hours = master.schedule[day.weekday];
    if (!hours) continue;
    const open = DateTime.fromISO(`${day.toISODate()}T${hours[0]}`, {
      zone: ZONE,
    });
    const close = DateTime.fromISO(`${day.toISODate()}T${hours[1]}`, {
      zone: ZONE,
    });
    const target =
      master.perDay[0] +
      Math.floor(random() * (master.perDay[1] - master.perDay[0] + 1));
    let cursor = open.plus({ minutes: 30 * Math.floor(random() * 3) });
    let made = 0;

    while (made < target) {
      const service = pick(random, services);
      const start = cursor;
      const end = start.plus({ minutes: service.minutes });
      const busyUntil = end.plus({ minutes: service.buffer });
      if (busyUntil > close) break;
      if (isBlocked(start, busyUntil)) {
        cursor = cursor.plus({ minutes: 60 });
        if (cursor >= close) break;
        continue;
      }

      const client = weighted(
        random,
        clients.map((item) => [item, item.weight]),
      );
      const isPast = end < now;
      const isPublic = random() < 0.8;
      const outcome = isPast
        ? weighted(random, [
            ["completed", 74],
            ["pending", 6],
            ["no_show", 6],
            ["cancelled_late", 5],
            ["cancelled_ok", 5],
            ["client_cancelled", 4],
          ])
        : weighted(random, [
            ["pending", 93],
            ["client_cancelled", 7],
          ]);
      const createdAt = DateTime.min(
        start.minus({ days: 1 + Math.floor(random() * 14) }),
        now.minus({ hours: 1 }),
      );
      const daysAgo = now.diff(start, "days").days;
      const raised = service.raise && daysAgo > service.raise.daysAgo;

      bookings.push({
        id: randomUUID(),
        clientId: client.id,
        serviceId: service.id,
        start,
        end,
        busyUntil,
        createdAt,
        source: isPublic ? "public_page" : "manual",
        acquisition: isPublic ? weighted(random, SOURCES) : null,
        status: outcome === "client_cancelled" ? "cancelled" : "confirmed",
        visitStatus: outcome === "client_cancelled" ? "pending" : outcome,
        // Старые записи подорожавшей услуги — по прежней цене; остальным цену
        // проставит триггер bookings_price_snapshot (поле оставляем пустым).
        price: raised ? service.raise.from : null,
        effectivePrice: raised ? service.raise.from : service.price,
        prepaymentRequired: Boolean(service.prepayment),
      });
      made += 1;
      cursor = roundUpToHalfHour(
        busyUntil.plus({ minutes: 30 * Math.floor(random() * 3) }),
      );
    }
  }

  const reviews = [];
  for (const booking of bookings) {
    if (booking.visitStatus !== "completed" || random() > 0.28) continue;
    const rating = weighted(random, [
      [5, 62],
      [4, 20],
      [3, 8],
      [2, 6],
      [1, 4],
    ]);
    const client = clients.find((item) => item.id === booking.clientId);
    reviews.push({
      id: randomUUID(),
      bookingId: booking.id,
      clientId: booking.clientId,
      rating,
      comment: random() < 0.85 ? pick(random, REVIEWS[rating]) : "",
      authorPhoneHash: hashPhone(client.phone),
      createdAt: booking.end.plus({ hours: 2 + Math.floor(random() * 30) }),
    });
  }

  return {
    ...master,
    profileId,
    services,
    clients,
    bookings,
    blocked,
    reviews,
  };
}

// --- ожидаемые цифры: независимо от src/lib/analytics.ts ---------------------
function expected(built, now) {
  const counted = built.bookings.filter((item) => item.status === "confirmed");
  const attended = (item) =>
    !["no_show", "cancelled_late", "cancelled_ok"].includes(item.visitStatus);
  const nowMs = now.toMillis();
  const firstVisit = new Map();
  for (const item of counted) {
    if (!attended(item) || item.start.toMillis() >= nowMs) continue;
    const prev = firstVisit.get(item.clientId);
    if (prev === undefined || item.start.toMillis() < prev)
      firstVisit.set(item.clientId, item.start.toMillis());
  }

  const ranges = {
    month: (() => {
      const start = now.startOf("month");
      const compareStart = start.minus({ months: 1 });
      return {
        start,
        end: start.plus({ months: 1 }),
        compareStart,
        compareEnd: DateTime.min(compareStart.plus(now.diff(start)), start),
      };
    })(),
    "prev-month": (() => {
      const start = now.startOf("month").minus({ months: 1 });
      return {
        start,
        end: start.plus({ months: 1 }),
        compareStart: start.minus({ months: 1 }),
        compareEnd: start,
      };
    })(),
    "90d": (() => {
      const end = now.startOf("day").plus({ days: 1 });
      const start = end.minus({ days: 90 });
      return {
        start,
        end,
        compareStart: start.minus({ days: 90 }),
        compareEnd: start,
      };
    })(),
  };

  const result = {};
  for (const [id, range] of Object.entries(ranges)) {
    const from = range.start.toMillis();
    const pastEnd = Math.min(range.end.toMillis(), nowMs);
    const inWindow = (item, a, b) =>
      item.start.toMillis() >= a && item.start.toMillis() < b;
    const done = counted.filter(
      (item) => attended(item) && inWindow(item, from, pastEnd),
    );
    const compare = counted.filter(
      (item) =>
        attended(item) &&
        inWindow(
          item,
          range.compareStart.toMillis(),
          Math.min(range.compareEnd.toMillis(), nowMs),
        ),
    );
    const upcoming = counted.filter(
      (item) =>
        item.visitStatus === "pending" &&
        inWindow(item, Math.max(from, nowMs), range.end.toMillis()),
    );
    const sum = (items) =>
      items.reduce((total, item) => total + item.effectivePrice, 0);
    const marked = counted.filter((item) => inWindow(item, from, pastEnd));
    const noShow = marked.filter((item) => item.visitStatus === "no_show");
    const late = marked.filter((item) => item.visitStatus === "cancelled_late");
    const periodClients = new Set(done.map((item) => item.clientId));
    const newCount = [...periodClients].filter(
      (clientId) => (firstVisit.get(clientId) ?? 0) >= from,
    ).length;
    result[id] = {
      revenue: sum(done),
      revenuePrevious: sum(compare),
      expectedAhead: sum(upcoming),
      visits: done.length,
      visitsPrevious: compare.length,
      averageCheck: done.length ? Math.round(sum(done) / done.length) : 0,
      noShowCount: noShow.length,
      noShowAmount: sum(noShow),
      lateCancelCount: late.length,
      lateCancelAmount: sum(late),
      clientsTotal: periodClients.size,
      clientsNew: newCount,
      clientsReturning: periodClients.size - newCount,
    };
  }
  return result;
}

// --- запись в базу -------------------------------------------------------------
async function insertChunked(table, rows) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await db
      .from(table)
      .insert(rows.slice(index, index + 500));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function findDemoProfiles() {
  const { data, error } = await db
    .from("profiles")
    .select("id, username, email, password_auth_id")
    .like("username", "demo-%")
    .like("email", `%@${EMAIL_DOMAIN}`);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function deleteDemo() {
  const profiles = await findDemoProfiles();
  const ids = profiles.map((row) => row.id);
  if (ids.length === 0) {
    console.log("Демо-аккаунтов нет.");
    return;
  }
  for (const table of [
    "reviews",
    "prepayments",
    "notification_events",
    "bookings",
    "clients",
    "services",
    "availability_rules",
    "blocked_slots",
  ]) {
    const { error } = await db.from(table).delete().in("profile_id", ids);
    if (error && !/does not exist/.test(error.message))
      throw new Error(`${table}: ${error.message}`);
  }
  // Сначала сотрудники, потом администратор: они ссылаются на него created_by_profile_id.
  const ordered = [...profiles].sort(
    (a, b) =>
      (a.username.includes("lumiere") ? 1 : 0) -
      (b.username.includes("lumiere") ? 1 : 0),
  );
  for (const profile of ordered) {
    const { error } = await db.from("profiles").delete().eq("id", profile.id);
    if (error)
      throw new Error(`profiles ${profile.username}: ${error.message}`);
    await db.auth.admin.deleteUser(profile.password_auth_id);
  }
  console.log(
    `Удалено демо-аккаунтов: ${profiles.length} (${profiles.map((row) => row.username).join(", ")})`,
  );
}

async function seed(password) {
  if ((await findDemoProfiles()).length > 0) {
    throw new Error("Демо уже есть. Сначала --delete.");
  }
  const now = DateTime.now().setZone(ZONE);
  const built = MASTERS.map((master) => buildMaster(master, now));
  built.forEach(assertNoOverlap);
  const studioAdmin = built.find((item) => item.role === "admin");
  const studioWorkspaceId = randomUUID();
  const until = now.plus({ years: 1 }).toUTC().toISO();

  for (const master of built) {
    const email = `${master.username}@${EMAIL_DOMAIN}`;
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(`auth ${email}: ${error?.message}`);

    const inStudio = master.role !== "solo";
    const { error: profileError } = await db.from("profiles").insert({
      id: master.profileId,
      email,
      password_auth_id: data.user.id,
      full_name: master.fullName,
      username: master.username,
      specialty: master.specialty,
      timezone: ZONE,
      bio: "",
      location_text: "Москва",
      address: inStudio
        ? "Москва, ул. Пятницкая, 12"
        : "Москва, ул. Покровка, 31",
      workspace_id: inStudio ? studioWorkspaceId : randomUUID(),
      workspace_name: inStudio
        ? studioAdmin.workspace.name
        : master.workspace.name,
      workspace_kind: inStudio ? "studio" : "solo",
      account_role: master.role,
      account_status: "active",
      created_by_profile_id:
        master.role === "staff" ? studioAdmin.profileId : null,
      referral_code: `DEMO${master.seed}${randomBytes(2).toString("hex").toUpperCase()}`,
      // Тариф и срок — только у плательщика: у сотрудников доступ от администратора.
      subscription_tier: master.tier ?? "free",
      subscription_until: master.tier ? until : null,
      subscription_period_days: master.tier ? 360 : null,
      autopay_enabled: false,
      created_at: now
        .minus({ days: DAYS_BACK + 20 })
        .toUTC()
        .toISO(),
    });
    if (profileError)
      throw new Error(`profile ${master.username}: ${profileError.message}`);
  }

  for (const master of built) {
    await insertChunked(
      "services",
      master.services.map((service) => ({
        id: service.id,
        profile_id: master.profileId,
        title: service.title,
        duration_minutes: service.minutes,
        price: service.price,
        buffer_minutes: service.buffer,
        is_active: true,
        sort_order: service.sortOrder,
        prepayment_type: service.prepayment ? "fixed" : "none",
        prepayment_value: service.prepayment ?? 0,
        repeat_interval_weeks: 4,
      })),
    );
    await insertChunked(
      "availability_rules",
      Object.entries(master.schedule).map(([weekday, [start, end]]) => ({
        profile_id: master.profileId,
        weekday: Number(weekday),
        start_time: start,
        end_time: end,
        is_active: true,
      })),
    );
    await insertChunked(
      "blocked_slots",
      master.blocked.map((slot) => ({
        id: slot.id,
        profile_id: master.profileId,
        starts_at: slot.startsAt.toUTC().toISO(),
        ends_at: slot.endsAt.toUTC().toISO(),
        reason: slot.reason,
      })),
    );

    const lastVisit = new Map();
    for (const booking of master.bookings) {
      const prev = lastVisit.get(booking.clientId);
      if (!prev || booking.start > prev)
        lastVisit.set(booking.clientId, booking.start);
    }
    const usedClients = master.clients.filter((client) =>
      lastVisit.has(client.id),
    );
    await insertChunked(
      "clients",
      usedClients.map((client) => ({
        id: client.id,
        profile_id: master.profileId,
        name: client.name,
        phone_encrypted: encryptPhone(client.phone),
        phone_last4: client.phone.slice(-4),
        phone_hash: hashPhone(client.phone),
        notes: "",
        last_booking_at: lastVisit.get(client.id).toUTC().toISO(),
        created_at: master.bookings
          .find((b) => b.clientId === client.id)
          .createdAt.toUTC()
          .toISO(),
      })),
    );

    await insertChunked(
      "bookings",
      master.bookings.map((booking) => ({
        id: booking.id,
        profile_id: master.profileId,
        client_id: booking.clientId,
        service_id: booking.serviceId,
        status: booking.status,
        starts_at: booking.start.toUTC().toISO(),
        ends_at: booking.end.toUTC().toISO(),
        busy_until: booking.busyUntil.toUTC().toISO(),
        source: booking.source,
        acquisition_source: booking.acquisition,
        created_at: booking.createdAt.toUTC().toISO(),
        cancelled_at:
          booking.status === "cancelled"
            ? booking.start.minus({ days: 1 }).toUTC().toISO()
            : null,
        visit_status: booking.visitStatus,
        visit_status_set_at:
          booking.visitStatus === "pending"
            ? null
            : booking.end.plus({ hours: 1 }).toUTC().toISO(),
        prepayment_required: booking.prepaymentRequired,
        ...(booking.price !== null ? { price: booking.price } : {}),
      })),
    );

    await insertChunked(
      "reviews",
      master.reviews.map((review) => ({
        id: review.id,
        profile_id: master.profileId,
        booking_id: review.bookingId,
        client_id: review.clientId,
        rating: review.rating,
        comment: review.comment,
        author_phone_hash: review.authorPhoneHash,
        created_at: review.createdAt.toUTC().toISO(),
      })),
    );
  }

  // Сводка + ожидаемые цифры для сверки с кабинетом.
  const summary = built.map((master) => {
    const byOutcome = {};
    for (const booking of master.bookings) {
      const key =
        booking.status === "cancelled"
          ? "client_cancelled"
          : booking.visitStatus;
      byOutcome[key] = (byOutcome[key] ?? 0) + 1;
    }
    return {
      username: master.username,
      email: `${master.username}@${EMAIL_DOMAIN}`,
      role: master.role,
      bookings: master.bookings.length,
      clients: new Set(master.bookings.map((b) => b.clientId)).size,
      reviews: master.reviews.length,
      byOutcome,
      expected: expected(master, now),
    };
  });
  console.log(JSON.stringify({ seededAt: now.toISO(), summary }, null, 2));
}

const args = process.argv.slice(2);
if (args.includes("--dry-run")) {
  const now = DateTime.now().setZone(ZONE);
  for (const master of MASTERS.map((item) => buildMaster(item, now))) {
    assertNoOverlap(master);
    const outcomes = {};
    for (const booking of master.bookings) {
      const key =
        booking.status === "cancelled"
          ? "client_cancelled"
          : booking.visitStatus;
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    }
    const e = expected(master, now);
    console.log(
      `${master.username.padEnd(22)} bookings=${master.bookings.length} clients=${new Set(master.bookings.map((b) => b.clientId)).size} reviews=${master.reviews.length} raisedOld=${master.bookings.filter((b) => b.price !== null).length}`,
      JSON.stringify(outcomes),
    );
    console.log(
      `  90d: revenue=${e["90d"].revenue} visits=${e["90d"].visits} avg=${e["90d"].averageCheck} noShow=${e["90d"].noShowCount}/${e["90d"].noShowAmount} late=${e["90d"].lateCancelCount} clients=${e["90d"].clientsTotal} (new ${e["90d"].clientsNew})`,
    );
  }
} else if (args.includes("--delete")) {
  await deleteDemo();
} else {
  const configPath = args[args.indexOf("--config") + 1];
  if (!args.includes("--config") || !configPath)
    throw new Error("Нужен --config demo.json с паролем.");
  const { password } = JSON.parse(readFileSync(configPath, "utf8"));
  if (!password || password.length < 12)
    throw new Error("Пароль демо-аккаунтов — от 12 символов.");
  await seed(password);
}
