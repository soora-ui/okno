import type { Scene, TourScript } from "@/components/tour/tour-player";
import {
  card,
  clientCard,
  containing,
  insideClient,
  isVisible,
  navLink,
} from "@/components/tour/tour-helpers";

// Демо-тур для лендинга (/demo/tour): профиль мастера, путь клиента до
// подтверждения и коротко по кабинету.

const chapters = [
  { title: "Профиль мастера", short: "Профиль" },
  { title: "Запись клиента", short: "Запись" },
  { title: "Кабинет мастера", short: "Кабинет" },
];

const scenes: Scene[] = [
  // Глава 1 — публичный профиль.
  {
    id: "identity",
    chapter: 0,
    frame: "profile",
    title: "Твоя витрина",
    text: "Имя, фото и специализация на первом экране. Клиент сразу видит, к кому записывается.",
    ms: 6500,
    run: (c) => c.focus('[data-tour="identity"]'),
  },
  {
    id: "slots",
    chapter: 0,
    frame: "profile",
    title: "Свободные окна",
    text: "Ближайшее свободное время видно сразу — не нужно спрашивать «а когда можно?».",
    ms: 6500,
    run: (c) => c.focus('[data-demo-id="slots"]'),
  },
  {
    id: "works",
    chapter: 0,
    frame: "profile",
    title: "Работы",
    text: "Портфолио прямо на странице записи: клиент видит твой стиль ещё до выбора времени.",
    ms: 6500,
    run: (c) => c.focus('[data-demo-id="works"]'),
  },
  {
    id: "catalog",
    chapter: 0,
    frame: "profile",
    title: "Услуги и цены",
    text: "Длительность и цена видны заранее — уточнять в переписке не нужно.",
    ms: 6500,
    run: (c) => c.focus('[data-demo-id="services"]'),
  },

  // Глава 2 — путь клиента от страницы до подтверждения.
  {
    id: "pick",
    chapter: 1,
    frame: "profile",
    title: "Выбор услуги",
    text: "Клиент нажимает «Выбрать» у нужной услуги и сразу попадает к свободному времени.",
    ms: 6000,
    run: (c) => c.focus('[data-demo-id="services"] article'),
    exit: '[data-demo-id="services"] article a',
  },
  {
    id: "time",
    chapter: 1,
    frame: "book",
    title: "Выбор окна",
    text: "Клиент видит только свободное время по твоему графику и выбирает сам.",
    ms: 8500,
    run: async (c) => {
      await c.focus('[data-tour="picker"]');
      await c.wait(1100);
      await c.tap('[data-tour="times"] a:nth-child(2)', { click: true });
      await c.wait(400);
      await c.focus('[data-tour="picker"]');
    },
    exit: '[data-tour="next"]',
  },
  {
    id: "contacts",
    chapter: 1,
    frame: "contacts",
    title: "Пара полей — и всё",
    text: "Имя, телефон и комментарий, если нужен. Без регистрации и паролей.",
    ms: 13500,
    run: async (c) => {
      c.doc
        .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'input[name="name"], input[name="phone"], textarea[name="note"]',
        )
        .forEach((field) => {
          field.value = "";
        });
      await c.focus("form");
      await c.wait(500);
      await c.tap('input[name="name"]');
      await c.type('input[name="name"]', "Марина");
      await c.tap('input[name="phone"]');
      await c.type('input[name="phone"]', "+7 999 999 99 99");
      await c.tap('textarea[name="note"]');
      await c.type('textarea[name="note"]', "Хочу нюд, без дизайна");
      await c.wait(400);
      await c.focus('[data-tour="summary"]');
    },
    exit: 'button[type="submit"]',
  },
  {
    id: "confirm",
    chapter: 1,
    frame: "confirm",
    title: "Запись готова",
    text: "Клиент сразу видит детали визита, а запись появляется у тебя в кабинете.",
    ms: 6500,
    run: (c) => c.focus('[data-tour="confirm"]'),
  },

  // Глава 3 — кабинет мастера, коротко по разделам.
  {
    id: "home",
    chapter: 2,
    frame: "dashboard",
    title: "Главная",
    text: "Сегодняшние и ближайшие визиты. Марина, которая только что записалась, уже здесь.",
    ms: 8500,
    run: async (c) => {
      await c.focus(card("Ближайшие записи"));
      await c.wait(1300);
      await c.focus(containing("Марина Соколова", '[class*="rounded"]'));
    },
  },
  {
    id: "manual",
    chapter: 2,
    frame: "dashboard",
    title: "Ручная запись",
    text: "Клиент написал в мессенджер? Добавь визит вручную — это время сразу закроется на странице.",
    ms: 6500,
    run: (c) => c.focus(card("Ручная запись")),
    exit: navLink("/schedule"),
  },
  {
    id: "schedule",
    chapter: 2,
    frame: "schedule",
    title: "Расписание",
    text: "Рабочие часы по дням и разовые блокировки: обед, отпуск, закупка.",
    ms: 8000,
    run: async (c) => {
      await c.focus(card("Рабочие часы"));
      await c.wait(1900);
      await c.focus(card("Ручные блокировки"));
    },
    exit: navLink("/clients"),
  },
  {
    id: "clients",
    chapter: 2,
    frame: "clients",
    title: "Клиенты",
    text: "Карточка собирается сама из записей: контакты, сколько было визитов, когда следующий и что человек обычно выбирает.",
    ms: 7500,
    run: (c) => c.focus(clientCard("Марина Соколова")),
  },
  {
    id: "return-rate",
    chapter: 2,
    frame: "clients",
    title: "Частота возврата",
    text: "Сколько дней в среднем проходит между визитами. Марина приходит раз в три недели — если она задержится дольше обычного, okno подскажет напомнить о себе.",
    ms: 8000,
    run: (c) => c.focus(insideClient("Марина Соколова", "Частота возврата")),
  },
  {
    id: "reliability",
    chapter: 2,
    frame: "clients",
    title: "Оценка клиента",
    text: "Доля визитов, на которые человек правда пришёл. Неявки и поздние отмены её снижают. Появляется после трёх отмеченных визитов, и видишь её только ты.",
    ms: 9000,
    run: async (c) => {
      await c.focus(insideClient("Марина Соколова", "Надёжный"));
      await c.wait(2600);
      await c.focus(insideClient("Ксения Белова", "Бывают пропуски"));
    },
    exit: navLink("/settings"),
  },
  {
    id: "settings",
    chapter: 2,
    frame: "settings",
    title: "Настройки",
    text: "Профиль, график, услуги, правила записи, уведомления в Telegram — всё в одном месте.",
    ms: 8500,
    run: async (c) => {
      c.click('[data-tour-tab="profile"]');
      // При повторе шага строка вкладок могла остаться докрученной.
      c.doc.querySelector('[data-tour="settings-tabs"]')?.scrollTo({ left: 0 });
      await c.focus('[data-tour="settings-tabs"]');
      await c.wait(600);
      await c.tap('[data-tour-tab="booking"]', { click: true });
      await c.wait(300);
      // У вкладки две раскладки — для телефона и для широкого экрана; берём видимую.
      await c.focus((doc) => {
        let el = doc.querySelector('[data-tour="settings-tabs"]')?.nextElementSibling;
        while (el && !isVisible(el)) el = el.nextElementSibling;
        return el;
      });
    },
  },
];

export const demoTourScript: TourScript = {
  chapters,
  scenes,
  frames: [
    { id: "profile", kind: "profile" },
    { id: "book", kind: "page", resetWhenHidden: true },
    { id: "contacts", kind: "page" },
    { id: "confirm", kind: "page" },
    { id: "dashboard", kind: "cabinet" },
    { id: "schedule", kind: "cabinet" },
    { id: "clients", kind: "cabinet" },
    { id: "settings", kind: "cabinet" },
  ],
  palette: { chapter: 0, frame: "profile" },
};
