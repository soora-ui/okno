import type { Scene, SceneCtx, TourScript } from "@/components/tour/tour-player";
import { CARD_SELECTOR, card, containing, field, visible } from "@/components/tour/tour-helpers";

// База знаний в кабинете (/knowledge): по главе на каждый участок настроек.
// Показываем на демо-кабинете (/demo/cabinet/*), поэтому сценарий может
// нажимать вкладки и раскрывать разделы — настройки мастера не меняются.
//
// Каждая сцена сама приводит страницу в нужное состояние (нужная вкладка,
// нужный раздел «Записи»): в главу можно попасть из оглавления, «назад» или
// после свободной прокрутки, и предыдущий шаг не обязан был сыграть.

type SettingsTab = "profile" | "schedule" | "services" | "booking" | "account";
type RecordSection = "booking-params" | "booking-page" | "certificates" | "telegram" | "color-palette";

/**
 * Открыть вкладку настроек, если она ещё не открыта. По умолчанию — пальцем,
 * чтобы было видно, где она; quiet — мгновенно, когда вкладка лишь подготовка
 * к главному действию шага.
 */
async function openTab(c: SceneCtx, tab: SettingsTab, quiet = false) {
  const selector = `[data-tour-tab="${tab}"]`;
  if (c.doc.querySelector(selector)?.hasAttribute("data-active")) return;
  if (quiet) {
    // Страница могла ещё не ожить после загрузки, и клик пропадёт —
    // повторяем, пока вкладка не станет активной.
    for (let i = 0; i < 20; i++) {
      c.click(selector);
      await c.wait(150);
      if (c.doc.querySelector(selector)?.hasAttribute("data-active")) break;
    }
    await c.wait(200);
    return;
  }
  await c.tap(selector, { click: true });
  await c.wait(500);
}

/**
 * Открыть раздел вкладки «Запись». На широком экране это боковое меню, на
 * телефоне — аккордеон: там сначала закрываем чужие раскрытые разделы.
 */
async function openSection(c: SceneCtx, section: RecordSection) {
  await openTab(c, "booking", true);
  const target = visible(`[data-tour-section="${section}"]`);
  let button: Element | null | undefined = null;
  for (let i = 0; i < 20 && !button; i++) {
    button = typeof target === "function" ? target(c.doc) : null;
    if (!button) await c.wait(150);
  }
  if (!button) return;

  if (button.hasAttribute("aria-expanded")) {
    c.doc
      .querySelectorAll<HTMLElement>('[data-tour-section][aria-expanded="true"]')
      .forEach((other) => {
        if (other !== button && other.offsetParent) other.click();
      });
    if (button.getAttribute("aria-expanded") === "true") return;
    await c.wait(300);
    await c.tap(target, { click: true });
    await c.wait(600);
    return;
  }

  if (button.hasAttribute("data-active")) return;
  await c.tap(target, { click: true });
  await c.wait(500);
}

/** Сначала поле, через паузу — следующее: два связанных параметра в одном шаге. */
async function focusPair(c: SceneCtx, first: string, second: string) {
  await c.focus(field(first));
  await c.wait(2400);
  await c.focus(field(second));
}

const chapters = [
  {
    title: "Профиль мастера",
    short: "Профиль",
    summary: "Имя, адрес, фото работ и ссылка, которую отправляешь клиентам.",
  },
  {
    title: "Рабочие часы",
    short: "Часы",
    summary: "Дни и часы приёма и разовые блокировки: обед, отпуск, закупка.",
  },
  {
    title: "Услуги",
    short: "Услуги",
    summary: "Цена и длительность, повторный визит и предоплата.",
  },
  {
    title: "Правила записи",
    short: "Правила",
    summary: "Окно записи, шаг времени, перерыв, отмена и напоминания.",
  },
  {
    title: "Страница и цвет",
    short: "Страница",
    summary: "Заголовок первого экрана, поле комментария и палитра страницы.",
  },
  {
    title: "Уведомления и сертификаты",
    short: "Telegram",
    summary: "Бот в Telegram и продажа подарочных сертификатов.",
  },
  {
    title: "Аккаунт",
    short: "Аккаунт",
    summary: "Тариф, приглашения коллег и вход в кабинет.",
  },
];

const scenes: Scene[] = [
  // Глава 1 — профиль.
  {
    id: "kb-about",
    chapter: 0,
    frame: "settings",
    title: "О мастере",
    text: "Имя, ниша, город, точный адрес и пара слов о себе — это шапка твоей страницы записи. Часовой пояс для записей и уведомлений определится по городу сам.",
    ms: 9000,
    run: async (c) => {
      await openTab(c, "profile");
      await c.focus(card("О мастере"));
    },
  },
  {
    id: "kb-media",
    chapter: 0,
    frame: "settings",
    title: "Фото и работы",
    text: "Аватар и фото готовых работ. На странице записи работы идут отдельным блоком — клиент видит твой стиль ещё до выбора времени.",
    ms: 8500,
    run: async (c) => {
      await openTab(c, "profile");
      await c.focus(containing("Аватар", CARD_SELECTOR));
      await c.wait(2400);
      await c.focus(containing("Готовые работы", CARD_SELECTOR));
    },
  },
  {
    id: "kb-link",
    chapter: 0,
    frame: "settings",
    title: "Публичная ссылка",
    text: "Её отправляешь клиентам в мессенджер или ставишь в шапку соцсетей. Записаться по ней можно без регистрации.",
    ms: 7000,
    run: async (c) => {
      await openTab(c, "profile");
      await c.focus(card("Публичная ссылка"));
    },
  },

  // Глава 2 — рабочие часы.
  {
    id: "kb-hours",
    chapter: 1,
    frame: "settings",
    title: "Дни и часы приёма",
    text: "Отметь рабочие дни и часы. Свободные окна на странице записи появляются только внутри них.",
    ms: 8000,
    run: async (c) => {
      await openTab(c, "schedule");
      await c.focus(card("Рабочие дни и часы"));
    },
  },
  {
    id: "kb-blocks",
    chapter: 1,
    frame: "schedule",
    title: "Разовые блокировки",
    text: "Обед, отпуск, закупка: заблокируй время в разделе «Расписание» — и оно пропадёт со страницы записи.",
    ms: 8000,
    run: (c) => c.focus(card("Ручные блокировки")),
  },

  // Глава 3 — услуги.
  {
    id: "kb-services",
    chapter: 2,
    frame: "settings",
    title: "Список услуг",
    text: "Каждая услуга — карточка на странице записи: название, описание, длительность и цена.",
    ms: 8000,
    run: async (c) => {
      await openTab(c, "services");
      await c.focus(card("Услуги"));
    },
  },
  {
    id: "kb-repeat",
    chapter: 2,
    frame: "settings",
    title: "Повторный визит",
    text: "Через сколько дней услугу можно повторить. Клиент сможет отметить напоминание при записи, а консультант — предложить время после этого срока.",
    ms: 9000,
    run: async (c) => {
      await openTab(c, "services");
      await c.focus(field("Повторный визит через"));
    },
  },
  {
    id: "kb-prepay",
    chapter: 2,
    frame: "settings",
    title: "Предоплата",
    text: "Клиент вносит предоплату при записи через ЮKassa. Магазин подключается здесь, а нужна ли предоплата — решаешь для каждой услуги.",
    ms: 8500,
    run: async (c) => {
      await openTab(c, "services");
      await c.focus(card("Приём предоплаты"));
    },
  },

  // Глава 4 — правила записи.
  {
    id: "kb-params",
    chapter: 3,
    frame: "settings",
    title: "Параметры записи",
    text: "Шесть правил, по которым работает твоя страница записи. Пройдём по ним по очереди.",
    ms: 7000,
    run: async (c) => {
      await openSection(c, "booking-params");
      await c.focus(card("Параметры записи"));
    },
  },
  {
    id: "kb-window",
    chapter: 3,
    frame: "settings",
    title: "Окно и шаг времени",
    text: "Окно — на сколько дней вперёд открыта запись. Шаг — через сколько минут показывать время: при 30 клиент видит 10:00, 10:30, 11:00.",
    ms: 9500,
    run: async (c) => {
      await openSection(c, "booking-params");
      await focusPair(c, "Окно записи", "С каким шагом показывать время");
    },
  },
  {
    id: "kb-buffer",
    chapter: 3,
    frame: "settings",
    title: "Перерыв после записи",
    text: "Запас времени после каждого клиента, чтобы визиты не стояли вплотную: убраться, выдохнуть, подготовить место.",
    ms: 7500,
    run: async (c) => {
      await openSection(c, "booking-params");
      await c.focus(field("Перерыв после записи"));
    },
  },
  {
    id: "kb-cancel",
    chapter: 3,
    frame: "settings",
    title: "Самостоятельная отмена",
    text: "За сколько часов до визита клиент ещё может отменить запись сам. Позже — только через тебя.",
    ms: 7500,
    run: async (c) => {
      await openSection(c, "booking-params");
      await c.focus(field("Отмена не позже"));
    },
  },
  {
    id: "kb-reminders",
    chapter: 3,
    frame: "settings",
    title: "Напоминания",
    text: "За сколько часов до визита придут напоминания: клиенту и тебе в Telegram. Поставь 0, чтобы отключить.",
    ms: 9500,
    run: async (c) => {
      await openSection(c, "booking-params");
      await focusPair(c, "Напомнить клиенту", "Напомнить мастеру");
    },
  },

  // Глава 5 — страница и цвет.
  {
    id: "kb-showcase",
    chapter: 4,
    frame: "settings",
    title: "Витрина страницы",
    text: "Заголовок и подзаголовок первого экрана, поле комментария — скрыть, по желанию или обязательно — и как с тобой связаться.",
    ms: 9000,
    run: async (c) => {
      await openSection(c, "booking-page");
      await c.focus(card("Витрина страницы записи"));
    },
  },
  {
    id: "kb-colors",
    chapter: 4,
    frame: "settings",
    title: "Цвет страниц",
    text: "Палитра для профиля, записи и подтверждения. Кнопки и акценты перекрашиваются вместе, а тёмная тема у клиента подстраивается сама.",
    ms: 9000,
    run: async (c) => {
      await openSection(c, "color-palette");
      await c.focus(card("Цвет клиентских страниц"));
    },
  },

  // Глава 6 — уведомления и сертификаты.
  {
    id: "kb-telegram",
    chapter: 5,
    frame: "settings",
    title: "Бот в Telegram",
    text: "Бот пишет о новых записях и напоминает о визитах. Из чата видно расписание на сегодня и неделю, а запись можно отменить, не заходя в кабинет.",
    ms: 9500,
    run: async (c) => {
      await openSection(c, "telegram");
      await c.focus(card("Telegram-уведомления"));
    },
  },
  {
    id: "kb-certificates",
    chapter: 5,
    frame: "settings",
    title: "Подарочные сертификаты",
    text: "Клиенты покупают сертификат прямо на твоей странице и оплачивают онлайн, а после оплаты скачивают PDF с QR-кодом.",
    ms: 9000,
    run: async (c) => {
      await openSection(c, "certificates");
      await c.focus(card("Подарочные сертификаты"));
    },
  },

  // Глава 7 — аккаунт.
  {
    id: "kb-plan",
    chapter: 6,
    frame: "settings",
    title: "Подписка",
    text: "Твой тариф и до какого числа он оплачен. Здесь же продление и смена тарифа.",
    ms: 7500,
    run: async (c) => {
      await openTab(c, "account");
      await c.focus(card("Подписка"));
    },
  },
  {
    id: "kb-referral",
    chapter: 6,
    frame: "settings",
    title: "Приглашения",
    text: "Твоя ссылка для приглашения коллег и список тех, кто по ней зарегистрировался.",
    ms: 7500,
    run: async (c) => {
      await openTab(c, "account");
      await c.focus(card("Реферальная программа"));
    },
  },
  {
    id: "kb-access",
    chapter: 6,
    frame: "settings",
    title: "Вход в кабинет",
    text: "Email и пароль для входа. Чтобы их поменять, понадобится текущий пароль.",
    ms: 7000,
    run: async (c) => {
      await openTab(c, "account");
      await c.focus(card("Доступ к аккаунту"));
    },
  },
];

export const knowledgeBaseScript: TourScript = {
  chapters,
  scenes,
  frames: [
    { id: "settings", kind: "cabinet" },
    { id: "schedule", kind: "cabinet" },
  ],
};

export const knowledgeBaseChapters = chapters.map((chapter, index) => ({
  ...chapter,
  steps: scenes.filter((scene) => scene.chapter === index).length,
}));
