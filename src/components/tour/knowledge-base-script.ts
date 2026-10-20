import type { Scene, SceneCtx, TourScript } from "@/components/tour/tour-player";
import {
  CARD_SELECTOR,
  card,
  containing,
  field,
  isVisible,
  visible,
  type Target,
} from "@/components/tour/tour-helpers";
import {
  demoCertificateBuyerEmail,
  demoCertificateDenominations,
  demoCertificateDesign,
  demoConsultantManual,
  demoConsultantQuestion,
} from "@/lib/tour-demo-content";

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

/** Видимая кнопка с надписью (внутри scope, если он задан). */
const button =
  (text: string, scope?: Target): Target =>
  (doc) => {
    const root = scope ? (typeof scope === "function" ? scope(doc) : doc.querySelector(scope)) : doc;
    if (!root) return null;
    return [...root.querySelectorAll("button")].find(
      (el) => isVisible(el) && el.textContent?.trim().includes(text),
    );
  };

/** Самый тесный блок с текстом внутри scope. */
const inside =
  (scope: Target, text: string, selector = "*"): Target =>
  (doc) => {
    const root = typeof scope === "function" ? scope(doc) : doc.querySelector(scope);
    if (!root) return null;
    const area = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    };
    return [...root.querySelectorAll(selector)]
      .filter((el) => isVisible(el) && el.textContent?.includes(text) && el.children.length > 0)
      .sort((a, b) => area(a) - area(b))[0];
  };

const DEMO_SERVICE = "Накладки soft gel";

const FREE_WINDOWS = "Где в расписании пусто";
const SOURCES = "Откуда клиенты";
const STORY_DIALOG = '[role="dialog"][aria-modal="true"]';
const STORY_CLOSE = `${STORY_DIALOG} button[aria-label="Закрыть"]`;

/**
 * Превью сторис рисует сервер. Следующий стиль выбираем, когда картинка
 * готова: иначе запросы встают в очередь и нужное превью приходит последним.
 */
async function storyPreviewReady(c: SceneCtx) {
  for (let i = 0; i < 60; i++) {
    await c.wait(200);
    const img = c.doc.querySelector<HTMLImageElement>(`${STORY_DIALOG} img`);
    if (img?.complete && img.naturalWidth > 0) return;
  }
}

/** Шаг мог начаться с открытым окном сторис (назад или повтор) — закрываем без анимации. */
function closeStoryDialog(c: SceneCtx) {
  if (c.doc.querySelector(STORY_CLOSE)) c.click(STORY_CLOSE);
}

const DESIGN_DIALOG = '[role="dialog"][aria-label="Дизайн сертификата"]';

/** Форма номиналов и срока действия в разделе сертификатов. */
const certificateSettingsForm: Target = (doc) =>
  [...doc.querySelectorAll("form")].find(
    (form) => isVisible(form) && form.querySelector('input[name="denominations"]'),
  );

/** Карточка услуги в настройках (форма редактирования). */
const serviceEditor: Target = (doc) =>
  [...doc.querySelectorAll("form")].find(
    (form) => isVisible(form) && form.querySelector("h3")?.textContent?.trim() === DEMO_SERVICE,
  );

/** Блок AI-консультации под карточкой той же услуги. */
const manualEditor: Target = (doc) => {
  const editor = typeof serviceEditor === "function" ? serviceEditor(doc) : null;
  return editor?.parentElement?.querySelector("form:not(:first-of-type)") ??
    [...doc.querySelectorAll("form")].find(
      (form) => isVisible(form) && form.querySelector("h4")?.textContent?.includes("AI-консультация"),
    );
};

async function openServiceEditor(c: SceneCtx, animated = true) {
  await openTab(c, "services", true);
  const editor = typeof serviceEditor === "function" ? serviceEditor(c.doc) : null;
  if (editor?.querySelector('input[name="title"]')) return;
  if (animated) {
    await c.tap(button("Редактировать", serviceEditor), { click: true });
  } else {
    c.click(button("Редактировать", serviceEditor));
  }
  await c.wait(600);
}

/** Сообщение «сохранено» внизу демо-страницы — подсвечиваем его, чтобы было видно ответ. */
async function showSaved(c: SceneCtx) {
  await c.wait(350);
  await c.focus("[data-demo-toast]");
  await c.wait(1800);
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
    summary: "Карточка услуги, перерыв после визита, предоплата и AI-консультант.",
  },
  {
    title: "Правила записи",
    short: "Правила",
    summary: "Окно записи, шаг времени, отмена и напоминания.",
  },
  {
    title: "Страница и цвет",
    short: "Страница",
    summary: "Заголовок первого экрана, поле комментария и палитра страницы.",
  },
  {
    title: "Уведомления и сертификаты",
    short: "Telegram",
    summary: "Бот в Telegram и подарочные сертификаты: от дизайна до покупки и погашения.",
  },
  {
    title: "Горящие окошки и соцсети",
    short: "Продвижение",
    summary: "Свободное время — в сторис и чаты, и какая соцсеть приводит записи.",
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
    text: "Имя, ниша, город, точный адрес и пара слов о себе — это шапка твоей страницы записи.",
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
    text: "Отметь рабочие дни и часы: например, в понедельник работаешь до 19:00, а субботу делаешь выходным. После «Сохранить» свободные окна на странице записи пересчитаются.",
    ms: 16000,
    run: async (c) => {
      await openTab(c, "schedule");
      // При повторе шага возвращаем исходное расписание без анимации.
      const saturday = c.doc.querySelector<HTMLInputElement>('input[name="active_6"]');
      if (saturday && !saturday.checked) {
        c.click((doc) => doc.querySelector('input[name="active_6"]')?.parentElement?.querySelector("button"));
      }
      await c.setValue('input[name="end_1"]', "18:00");

      await c.focus(card("Рабочие дни и часы"));
      await c.wait(1400);
      await c.tap('input[name="end_1"]');
      await c.setValue('input[name="end_1"]', "19:00");
      await c.wait(900);
      await c.tap(
        (doc) => doc.querySelector('input[name="active_6"]')?.parentElement?.querySelector("button"),
        { click: true },
      );
      await c.wait(900);
      await c.tap(button("Сохранить расписание"), { click: true });
      await showSaved(c);
    },
  },
  {
    id: "kb-blocks",
    chapter: 1,
    frame: "schedule",
    title: "Разовые блокировки",
    text: "Обед, отпуск, закупка: выбери дату и время, добавь причину — и это время пропадёт со страницы записи.",
    ms: 16000,
    run: async (c) => {
      const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      await c.setValue('input[name="reason"], textarea[name="reason"]', "");
      await c.focus(card("Ручные блокировки"));
      await c.wait(1200);
      await c.tap('input[name="date"]');
      await c.setValue('input[name="date"]', inTwoDays);
      await c.wait(500);
      await c.tap('input[name="startTime"]');
      await c.setValue('input[name="startTime"]', "14:00");
      await c.setValue('input[name="endTime"]', "15:00");
      await c.wait(500);
      await c.tap('input[name="reason"], textarea[name="reason"]');
      await c.type('input[name="reason"], textarea[name="reason"]', "Обед");
      await c.wait(400);
      await c.tap(button("Заблокировать время"), { click: true });
      await showSaved(c);
    },
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
      // При повторе шага карточка могла остаться раскрытой.
      const editor = typeof serviceEditor === "function" ? serviceEditor(c.doc) : null;
      if (editor?.querySelector('input[name="title"]')) c.click(button("Свернуть", serviceEditor));
      await c.focus(card("Услуги"));
    },
  },
  {
    id: "kb-service-card",
    chapter: 2,
    frame: "settings",
    title: "Карточка услуги",
    text: "Нажми «Редактировать» — карточка раскроется: название, описание, длительность, цена, перерыв после визита, через сколько дней повторить и предоплата.",
    ms: 11000,
    run: async (c) => {
      await openServiceEditor(c);
      await c.focus(serviceEditor);
      await c.wait(2200);
      await c.focus(field("Длительность"));
      await c.wait(1600);
      await c.focus(field("Цена"));
    },
  },
  {
    id: "kb-buffer",
    chapter: 2,
    frame: "settings",
    title: "Перерыв после визита",
    text: "У каждой услуги свой перерыв: после накладок нужно убрать место и выдохнуть, а после снятия — нет. Следующая запись начнётся не раньше, чем закончится перерыв.",
    ms: 9000,
    run: async (c) => {
      await openServiceEditor(c, false);
      await c.focus(field("Перерыв после визита"));
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
      await openServiceEditor(c, false);
      await c.focus(field("Повторный визит через"));
    },
  },
  {
    id: "kb-prepay",
    chapter: 2,
    frame: "settings",
    title: "Предоплата",
    text: "Предоплату включаешь для конкретной услуги — суммой или процентом, клиент вносит её при записи. Для этого один раз подключи ЮKassa в блоке «Приём предоплаты».",
    ms: 10000,
    run: async (c) => {
      await openServiceEditor(c, false);
      await c.focus(inside(serviceEditor, "Предоплата"));
      await c.wait(2600);
      await c.focus(card("Приём предоплаты"));
    },
  },
  {
    id: "kb-manual",
    chapter: 2,
    frame: "settings",
    title: "AI-консультант",
    text: "Консультант отвечает клиентам на вопросы об услуге — строго по мануалу, который пишешь ты: сроки, уход, противопоказания. Чего в мануале нет, на то он ответит «не знаю».",
    ms: 22000,
    run: async (c) => {
      await openServiceEditor(c, false);
      const content = 'textarea[name="content"]';
      if (!c.doc.querySelector(content)) {
        await c.tap(button("Настроить", manualEditor), { click: true });
        await c.wait(600);
      }
      await c.setValue(content, "");
      const agree = c.doc.querySelector<HTMLInputElement>('input[name="confirmed"]');
      if (agree?.checked) c.click('input[name="confirmed"]');

      await c.focus(manualEditor);
      await c.wait(900);
      await c.tap(content);
      await c.type(content, demoConsultantManual, { fast: true });
      await c.wait(600);
      await c.tap('input[name="confirmed"]', { click: true });
      await c.wait(500);
      await c.tap(button("Сохранить и подтвердить", manualEditor), { click: true });
      await showSaved(c);
    },
  },
  {
    id: "kb-consultant",
    chapter: 2,
    frame: "settings",
    companion: "client",
    companionLabel: "Так видит клиент",
    title: "Вопрос от клиента",
    text: "У услуги появляется кнопка «Задать вопрос». Клиент спрашивает — консультант отвечает по твоему мануалу в любое время, пока ты работаешь.",
    ms: 22000,
    run: async (c) => {
      const client = c.client;
      if (!client) return;
      await client.focus('[data-demo-id="services"] article');
      await client.wait(900);
      await client.tap(button("Задать вопрос"), { click: true });
      await client.wait(800);
      await client.tap('[role="dialog"] textarea');
      await client.type('[role="dialog"] textarea', demoConsultantQuestion);
      await client.wait(400);
      await client.tap('[role="dialog"] button[type="submit"]', { click: true });
      await client.focus('[role="dialog"]');
      await client.wait(3600);
    },
  },

  // Глава 4 — правила записи.
  {
    id: "kb-params",
    chapter: 3,
    frame: "settings",
    title: "Параметры записи",
    text: "Пять правил, по которым работает твоя страница записи. Пройдём по ним по очереди.",
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
    text: "Бот пишет о новых записях и напоминает о визитах, из чата видно расписание на сегодня и неделю. Нажми «Проверить связь» — бот сразу пришлёт сообщение.",
    ms: 14000,
    run: async (c) => {
      await openSection(c, "telegram");
      await c.focus(card("Telegram-уведомления"));
      await c.wait(1600);
      await c.tap(button("Проверить связь"), { click: true });
      await c.wait(900);
      await c.notify({
        app: "Telegram",
        title: "okno",
        text: "Проверка связи: уведомления okno доходят до этого чата.",
      });
    },
  },
  {
    id: "kb-cert-settings",
    chapter: 5,
    frame: "settings",
    title: "Сертификаты: номиналы",
    text: "Задай суммы, на которые клиенты смогут купить сертификат, и срок действия — или оставь бессрочными.",
    ms: 14000,
    run: async (c) => {
      await openSection(c, "certificates");
      await c.setValue('input[name="denominations"]', "");
      await c.focus(card("Подарочные сертификаты"));
      await c.wait(1400);
      await c.tap('input[name="denominations"]');
      await c.type('input[name="denominations"]', demoCertificateDenominations.join(", "));
      await c.wait(500);
      await c.tap(button("Сохранить", certificateSettingsForm), { click: true });
      await showSaved(c);
    },
  },
  {
    id: "kb-cert-design",
    chapter: 5,
    frame: "settings",
    title: "Дизайн сертификата",
    text: "Выбери цвета, название студии и слоган — и нажми «Сгенерировать»: Claude соберёт шаблон сертификата формата A5 с QR-кодом.",
    ms: 22000,
    run: async (c) => {
      await openSection(c, "certificates");
      if (!c.doc.querySelector(DESIGN_DIALOG)) {
        await c.tap(
          (doc) =>
            (button("Давай создадим") as (d: Document) => Element | undefined)(doc) ??
            (button("Изменить дизайн") as (d: Document) => Element | undefined)(doc),
          { click: true },
        );
        await c.wait(700);
      }
      await c.focus(DESIGN_DIALOG);
      await c.wait(900);
      await c.tap(`${DESIGN_DIALOG} input[name="primaryColor"]`);
      await c.setValue(`${DESIGN_DIALOG} input[name="primaryColor"]`, demoCertificateDesign.primaryColor);
      await c.setValue(`${DESIGN_DIALOG} input[name="secondaryColor"]`, demoCertificateDesign.secondaryColor);
      await c.wait(500);
      await c.tap(`${DESIGN_DIALOG} input[name="studioName"]`);
      await c.type(`${DESIGN_DIALOG} input[name="studioName"]`, demoCertificateDesign.studioName);
      await c.tap(`${DESIGN_DIALOG} input[name="tagline"]`);
      await c.type(`${DESIGN_DIALOG} input[name="tagline"]`, demoCertificateDesign.tagline);
      await c.wait(400);
      await c.tap(`${DESIGN_DIALOG} form button[type="submit"]`, { click: true });
      await c.focus(inside(DESIGN_DIALOG, "Генерирую", "p"));
      await c.wait(2800);
      await c.focus(`${DESIGN_DIALOG} [class*="aspect-[35/24]"]`);
      await c.wait(2400);
      await c.tap(`${DESIGN_DIALOG} button`, { click: true });
      await c.wait(500);
      await c.focus(inside(card("Подарочные сертификаты"), "Шаблон готов"));
    },
  },
  {
    id: "kb-cert-sale",
    chapter: 5,
    frame: "settings",
    title: "Продажа на странице",
    text: "Включи продажу — на твоей странице записи появится блок с сертификатами. Деньги за них приходят в твой магазин ЮKassa.",
    ms: 9000,
    run: async (c) => {
      await openSection(c, "certificates");
      const toggle = `[role="switch"]`;
      const isOn = () => c.doc.querySelector(toggle)?.getAttribute("aria-checked") === "true";
      if (isOn()) c.click(toggle);
      await c.focus(toggle);
      await c.wait(1000);
      await c.tap(toggle, { click: true });
    },
  },
  {
    id: "kb-cert-buy",
    chapter: 5,
    frame: "settings",
    companion: "buyer",
    companionLabel: "Так видит клиент",
    title: "Покупка сертификата",
    text: "Клиент выбирает сумму, оставляет почту и платит онлайн. Сразу после оплаты — сертификат с QR-кодом в PDF, его можно переслать в подарок.",
    ms: 24000,
    run: async (c) => {
      const client = c.client;
      if (!client) return;
      await client.focus("[data-certificates]");
      await client.wait(1000);
      await client.tap("[data-certificates] button:nth-child(2)", { click: true });
      await client.wait(800);
      await client.tap('[role="dialog"] input[name="purchaserEmail"]');
      await client.type('[role="dialog"] input[name="purchaserEmail"]', demoCertificateBuyerEmail);
      await client.wait(400);
      await client.tap('[role="dialog"] button[type="submit"]', { click: true });
      await client.wait(700);
      await client.focus("[data-demo-payment]");
      await client.wait(1400);
      await client.tap("[data-demo-payment] button", { click: true });
      await client.wait(2400);
      await client.focus('[role="dialog"]');
      await client.wait(3500);
    },
  },
  {
    id: "kb-cert-redeem",
    chapter: 5,
    frame: "dashboard",
    title: "Погашение",
    text: "Когда человек придёт с сертификатом, отсканируй QR-код на главной: увидишь остаток и спишешь сумму за визит.",
    ms: 8000,
    run: (c) => c.focus(card("Погасить сертификат")),
  },

  // Глава 7 — продвижение: горящие окошки и источники записей.
  {
    id: "kb-free-windows",
    chapter: 6,
    frame: "dashboard",
    title: "Горящие окошки",
    text: "На главной видно, где в расписании пусто на сегодня, завтра и послезавтра. Окошки считаются по рабочим часам, записям и перерывам — ровно то, что клиент увидит по ссылке.",
    ms: 10000,
    run: async (c) => {
      closeStoryDialog(c);
      await c.focus(card(FREE_WINDOWS));
      await c.wait(2600);
      // Полоски по дням: тёмные отрезки — свободное время.
      await c.focus((doc) => {
        const host = card(FREE_WINDOWS);
        return (typeof host === "function" ? host(doc) : null)?.querySelector("ul");
      });
    },
  },
  {
    id: "kb-free-windows-story",
    chapter: 6,
    frame: "dashboard",
    title: "Картинка для сторис",
    text: "Одна кнопка — и готова вертикальная картинка с окошками и ссылкой на запись. Три стиля и пять цветов; на телефоне она сразу уходит через «Поделиться» в сторис Instagram, Telegram или VK.",
    ms: 19000,
    exit: STORY_CLOSE,
    run: async (c) => {
      if (!c.doc.querySelector(STORY_DIALOG)) {
        await c.focus(card(FREE_WINDOWS));
        await c.wait(900);
        await c.tap(button("Картинка для сторис"), { click: true });
        await c.wait(900);
      }
      await c.focus(STORY_DIALOG);
      await storyPreviewReady(c);
      await c.wait(1000);
      await c.tap(button("Арка", STORY_DIALOG), { click: true });
      await storyPreviewReady(c);
      await c.wait(1000);
      await c.tap(visible(`${STORY_DIALOG} button[aria-label="Бордо"]`), { click: true });
      await storyPreviewReady(c);
      await c.focus(`${STORY_DIALOG} img`);
    },
  },
  {
    id: "kb-free-windows-text",
    chapter: 6,
    frame: "dashboard",
    title: "Текст для чатов",
    text: "«Скопировать текст» — окошки списком и ссылка на запись. Вставь в чат с постоянными клиентами, в Telegram-канал или статус WhatsApp.",
    ms: 9000,
    run: async (c) => {
      closeStoryDialog(c);
      await c.focus(card(FREE_WINDOWS));
      await c.wait(1200);
      await c.tap(button("Скопировать текст", card(FREE_WINDOWS)), { click: true });
    },
  },
  {
    id: "kb-sources",
    chapter: 6,
    frame: "dashboard",
    title: "Откуда клиенты",
    text: "Сколько онлайн-записей за 30 дней принёс каждый канал. Сверху — те, что работают: их стоит усиливать. «Не определён» — заходы без метки: по QR, из закладок или по прямой ссылке.",
    ms: 11000,
    run: async (c) => {
      closeStoryDialog(c);
      await c.focus(card(SOURCES));
      await c.wait(3000);
      await c.focus(inside(card(SOURCES), "Instagram", "li"));
    },
  },
  {
    id: "kb-sources-link",
    chapter: 6,
    frame: "dashboard",
    title: "Ссылка с меткой",
    text: "Нажми «Ссылка» у канала — скопируется адрес твоей страницы с меткой, например okno.business/alina-nails?from=instagram. Поставь его в шапку профиля, и каждая запись оттуда попадёт в счёт канала. Клиенту ссылка выглядит обычной.",
    ms: 12000,
    run: async (c) => {
      closeStoryDialog(c);
      const link = 'button[aria-label="Скопировать ссылку для Instagram"]';
      await c.focus(inside(card(SOURCES), "Instagram", "li"));
      await c.wait(1400);
      await c.tap(link, { click: true });
    },
  },

  // Глава 8 — аккаунт.
  {
    id: "kb-plan",
    chapter: 7,
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
    chapter: 7,
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
    chapter: 7,
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
    { id: "dashboard", kind: "cabinet" },
    { id: "client", kind: "profile", companion: true },
    { id: "buyer", kind: "profile", companion: true },
  ],
};

export const knowledgeBaseChapters = chapters.map((chapter, index) => ({
  ...chapter,
  steps: scenes.filter((scene) => scene.chapter === index).length,
}));
