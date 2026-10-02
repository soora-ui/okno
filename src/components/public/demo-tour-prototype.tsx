"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Laptop,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  TOUR_THEME_MESSAGE,
  type TourThemeMessage,
} from "@/components/public/demo-theme-switcher";
import {
  bookingThemePresets,
  defaultBookingThemePresetId,
  getBookingThemePreset,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";

export type TourFrameId =
  | "profile"
  | "book"
  | "contacts"
  | "confirm"
  | "dashboard"
  | "schedule"
  | "clients"
  | "settings";

type FrameId = TourFrameId;
type DeviceId = "phone" | "laptop";

// Порядок экранов — как в настоящем пути. По нему же решается, откуда
// въезжает страница: вперёд — справа, назад — слева.
const FRAME_ORDER: FrameId[] = [
  "profile",
  "book",
  "contacts",
  "confirm",
  "dashboard",
  "schedule",
  "clients",
  "settings",
];

const CABINET_FRAMES: FrameId[] = ["dashboard", "schedule", "clients", "settings"];

/** Что подсвечивать: CSS-селектор или поиск по документу. */
type Target = string | ((doc: Document) => Element | null | undefined);

/**
 * Что сцена умеет делать со страницей внутри устройства. Все действия
 * асинхронные и прерываются, если зритель ушёл со сцены.
 */
type SceneCtx = {
  doc: Document;
  device: DeviceId;
  /** Камера доезжает до элемента, подсветка обводит его. */
  focus: (target: Target) => Promise<void>;
  /** Палец (или курсор) подъезжает и нажимает; click — нажать по-настоящему. */
  tap: (target: Target, options?: { click?: boolean }) => Promise<void>;
  /** Печать по буквам в поле. */
  type: (target: Target, text: string) => Promise<void>;
  /** Мгновенный клик без анимации — вернуть страницу в исходное состояние. */
  click: (target: Target) => void;
  wait: (ms: number) => Promise<void>;
};

type Scene = {
  id: string;
  chapter: number;
  frame: FrameId;
  title: string;
  text: string;
  /** Длительность сцены в автопросмотре. */
  ms: number;
  run: (ctx: SceneCtx) => Promise<void>;
  /** Что нажимает палец при переходе на следующую сцену. Нет на экране — переход без нажатия. */
  exit?: Target;
};

const CHAPTERS = [
  { title: "Профиль мастера", short: "Профиль" },
  { title: "Запись клиента", short: "Запись" },
  { title: "Кабинет мастера", short: "Кабинет" },
];

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** Карточка кабинета по её заголовку. */
const card =
  (heading: string): Target =>
  (doc) =>
    [...doc.querySelectorAll("h1, h2, h3")]
      .find((el) => el.textContent?.trim() === heading)
      ?.closest('[class*="rounded-card"]');

/** Самый тесный видимый блок, в котором встречается текст. */
const containing =
  (text: string, selector: string): Target =>
  (doc) => {
    const area = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    };
    return [...doc.querySelectorAll(selector)]
      .filter((el) => isVisible(el) && el.textContent?.includes(text))
      .sort((a, b) => area(a) - area(b))[0];
  };

const CARD_SELECTOR = '[class*="rounded-card"], [class*="rounded-section"], [class*="rounded-panel"]';

/** Карточка клиента в списке по имени. */
const clientCard = (name: string): Target => containing(name, CARD_SELECTOR);

/** Самый тесный блок с текстом внутри карточки клиента. */
const insideClient =
  (name: string, text: string): Target =>
  (doc) => {
    const host = clientCard(name);
    const cardEl = typeof host === "function" ? host(doc) : null;
    if (!cardEl) return null;
    const area = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    };
    return [...cardEl.querySelectorAll("*")]
      .filter((el) => isVisible(el) && el.textContent?.includes(text))
      .sort((a, b) => area(a) - area(b))
      .find((el) => el.children.length > 0 || el.tagName === "SPAN");
  };

const SCENES: Scene[] = [
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
    exit: (doc) => [...doc.querySelectorAll('a[href="/schedule"]')].find(isVisible),
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
    exit: (doc) => [...doc.querySelectorAll('a[href="/clients"]')].find(isVisible),
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
    exit: (doc) => [...doc.querySelectorAll('a[href="/settings"]')].find(isVisible),
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

const CHAPTER_STARTS = CHAPTERS.map((_, chapter) =>
  SCENES.findIndex((scene) => scene.chapter === chapter),
);

/**
 * Устройства: страницы внутри рендерятся в настоящей вёрстке своей ширины,
 * а само устройство потом масштабируется под место на странице.
 */
const DEVICES = {
  phone: {
    viewW: 390,
    viewH: 844,
    outerW: 390 + 24,
    outerH: 844 + 24,
    safeTop: 92,
    // Плавающая кнопка записи на профиле и нижняя панель кабинета.
    safeBottom: (frame: FrameId) =>
      frame === "profile" ? 96 : CABINET_FRAMES.includes(frame) ? 76 : 20,
  },
  laptop: {
    viewW: 1440,
    viewH: 900,
    outerW: 1600,
    outerH: 900 + 32 + 30,
    safeTop: 96,
    safeBottom: () => 24,
  },
} as const;

const SPOT_PAD = 10;

// Свободная прокрутка: колесом или пальцем по устройству. Подсветка и наезд
// камеры уходят, а после паузы шаг разыгрывается заново.
const FREE_SCROLL_IDLE_MS = 5000;

// Палитра: луч летит от кружка к устройству, и уже оттуда по странице
// растекается волна (TourThemeBridge). Сама волна идёт ~2.8 с.
const BEAM_MS = 1300;
const PAINT_MS = BEAM_MS + 2200 + 600;

type Beam = {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Цвета линий — из самого пресета. */
  colors: string[];
};

// Пружины намеренно неторопливые: тур смотрят, а не проходят на скорость.
const cameraSpring = { type: "spring", stiffness: 55, damping: 18, restDelta: 0.5 } as const;
const spotSpring = { type: "spring", stiffness: 80, damping: 19 } as const;
const pushSpring = { type: "spring", stiffness: 120, damping: 26 } as const;

type Rect = { x: number; y: number; w: number; h: number };
type Finger = { x: number; y: number; state: "hidden" | "move" | "press" };

class Cancelled extends Error {}

type Token = { cancelled: boolean; stops: Array<() => void> };

function newToken(): Token {
  return { cancelled: false, stops: [] };
}

function cancel(token: Token | null) {
  if (!token || token.cancelled) return;
  token.cancelled = true;
  token.stops.forEach((stop) => stop());
}

const emptyFrames = () =>
  Object.fromEntries(FRAME_ORDER.map((id) => [id, false])) as Record<FrameId, boolean>;

/** Какие экраны держать загруженными: всё до главы после достигнутой. */
function framesUpTo(chapter: number) {
  return new Set(SCENES.filter((scene) => scene.chapter <= chapter + 1).map((scene) => scene.frame));
}

export function DemoTourPrototype({
  frames,
  cleanHref,
  registerHref,
}: {
  frames: Record<FrameId, string>;
  cleanHref: string;
  registerHref: string;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [device, setDevice] = useState<DeviceId>("phone");
  const [autoplay, setAutoplay] = useState(false);
  const [busy, setBusy] = useState(false);
  // Самая дальняя глава, до которой дошёл зритель: её экраны и экраны
  // следующей держим загруженными, остальные не грузим зря.
  const [reached, setReached] = useState(0);
  const [loaded, setLoaded] = useState<Record<FrameId, boolean>>(emptyFrames);
  const [spot, setSpot] = useState<Rect | null>(null);
  const [finger, setFinger] = useState<Finger>({ x: 0, y: 0, state: "hidden" });
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [presetId, setPresetId] = useState<BookingThemePresetId>(defaultBookingThemePresetId);
  const [painting, setPainting] = useState(false);
  const [freeScroll, setFreeScroll] = useState(false);
  // Повтор текущего шага после свободной прокрутки: сценарий сцены
  // перезапускается и камера возвращается к нужному блоку.
  const [replay, setReplay] = useState(0);
  const freeScrollRef = useRef(false);
  const lastScrollAtRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleRef = useRef(1);
  const [beam, setBeam] = useState<Beam | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const frameRefs = useRef<Record<FrameId, HTMLIFrameElement | null>>(
    Object.fromEntries(FRAME_ORDER.map((id) => [id, null])) as Record<FrameId, null>,
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);
  const indexRef = useRef(index);
  const autoplayRef = useRef(autoplay);
  const busyRef = useRef(false);
  const sceneTokenRef = useRef<Token | null>(null);
  const exitTokenRef = useRef<Token | null>(null);
  // Автопросмотр листает дальше, когда и время сцены вышло, и сама сцена
  // доиграла — иначе печать в поля обрывалась бы на полуслове.
  const sceneDoneRef = useRef(false);
  const timeUpRef = useRef(false);

  useEffect(() => {
    indexRef.current = index;
    autoplayRef.current = autoplay;
  });

  const scene = SCENES[index];
  const spec = DEVICES[device];
  const isLast = index === SCENES.length - 1;
  const isChapterEnd = !isLast && SCENES[index + 1].chapter !== scene.chapter;
  const frameReady = loaded[scene.frame];
  const scale = stage.width
    ? Math.min(stage.width / spec.outerW, stage.height / spec.outerH, 1)
    : 0;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // iframe из серверной разметки начинает грузиться до гидратации, и его
  // load может случиться раньше, чем React повесит onLoad, — досматриваем.
  useEffect(() => {
    const done = FRAME_ORDER.filter((id) => {
      const doc = frameRefs.current[id]?.contentDocument;
      return doc?.readyState === "complete" && doc.location.href !== "about:blank";
    });
    if (done.length > 0) {
      setLoaded((l) => ({ ...l, ...Object.fromEntries(done.map((id) => [id, true])) }));
    }
  }, []);

  const makeCtx = useCallback(
    (frame: FrameId, token: Token): SceneCtx => {
      const win = frameRefs.current[frame]!.contentWindow!;
      const doc = win.document;
      const { viewW, viewH, safeTop } = DEVICES[device];
      const safeBottom = DEVICES[device].safeBottom(frame);

      const guard = () => {
        if (token.cancelled) throw new Cancelled();
      };

      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          const id = setTimeout(resolve, reduceMotion ? Math.min(ms, 120) : ms);
          token.stops.push(() => {
            clearTimeout(id);
            resolve();
          });
        }).then(guard);

      const resolveTarget = (target: Target) =>
        typeof target === "string"
          ? [...doc.querySelectorAll<HTMLElement>(target)].find(isVisible)
          : ((target(doc) as HTMLElement | null | undefined) ?? undefined);

      // Страница могла ещё гидратироваться — ждём элемент до пары секунд.
      const find = async (target: Target) => {
        for (let i = 0; i < 25; i++) {
          guard();
          const el = resolveTarget(target);
          if (el) return el;
          await wait(120);
        }
        throw new Cancelled();
      };

      const placeSpot = (el: Element, delta: number) => {
        if (token.cancelled) return;
        const r = el.getBoundingClientRect();
        const top = Math.max(r.top - delta - SPOT_PAD, safeTop - SPOT_PAD);
        const bottom = Math.min(r.bottom - delta + SPOT_PAD, viewH - safeBottom + SPOT_PAD);
        setSpot({
          x: Math.max(r.left - SPOT_PAD, 6),
          y: top,
          w: Math.min(r.width + SPOT_PAD * 2, viewW - 12),
          h: Math.max(bottom - top, 40),
        });
      };

      // Закреплённые элементы (нижняя панель кабинета, липкая шапка) от
      // прокрутки не двигаются: камере ехать к ним незачем, а подсветку
      // нельзя ни сдвигать на прокрутку, ни обрезать безопасными зонами —
      // иначе она повисает посреди страницы.
      const isPinned = (el: Element) => {
        for (let node: Element | null = el; node && node !== doc.body; node = node.parentElement) {
          const position = win.getComputedStyle(node).position;
          if (position === "fixed" || position === "sticky") return true;
        }
        return false;
      };

      const focus = async (target: Target) => {
        const el = await find(target);
        if (isPinned(el)) {
          if (token.cancelled) return;
          const r = el.getBoundingClientRect();
          const pad = SPOT_PAD / 2;
          const x = Math.max(r.left - pad, 4);
          const y = Math.max(r.top - pad, 4);
          setSpot({
            x,
            y,
            w: Math.min(r.right + pad, viewW - 4) - x,
            h: Math.min(r.bottom + pad, viewH - 4) - y,
          });
          return;
        }
        const r = el.getBoundingClientRect();
        const current = win.scrollY;
        const maxScroll = Math.max(0, doc.documentElement.scrollHeight - viewH);
        const room = viewH - safeTop - safeBottom;
        const topInView = safeTop + Math.max(0, (room - r.height) / 2);
        const to = Math.min(Math.max(current + r.top - topInView, 0), maxScroll);
        placeSpot(el, to - current);

        if (reduceMotion || Math.abs(to - current) < 2) {
          win.scrollTo({ top: to, behavior: "instant" });
        } else {
          await new Promise<void>((resolve) => {
            const scroll: AnimationPlaybackControls = animate(current, to, {
              ...cameraSpring,
              onUpdate: (v) => win.scrollTo({ top: v, behavior: "instant" }),
              onComplete: resolve,
            });
            token.stops.push(() => {
              scroll.stop();
              resolve();
            });
          });
        }
        guard();
        // Пока камера ехала, могли доиграть появления блоков — досчитываем.
        placeSpot(el, 0);
      };

      // Кнопка может прятаться за краем строки с горизонтальной прокруткой
      // (вкладки настроек на телефоне) — докручиваем строку, чтобы палец
      // нажимал на видимое.
      const revealHorizontally = async (el: HTMLElement) => {
        for (let node = el.parentElement; node && node !== doc.body; node = node.parentElement) {
          const overflowX = win.getComputedStyle(node).overflowX;
          if (!(overflowX === "auto" || overflowX === "scroll")) continue;
          if (node.scrollWidth <= node.clientWidth) continue;

          const box = node.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          const margin = 24;
          let delta = 0;
          if (r.right > box.right - margin) delta = r.right - (box.right - margin);
          else if (r.left < box.left + margin) delta = r.left - (box.left + margin);
          if (Math.abs(delta) < 1) continue;

          const scroller = node;
          const from = scroller.scrollLeft;
          const to = Math.min(Math.max(from + delta, 0), scroller.scrollWidth - scroller.clientWidth);
          if (reduceMotion) {
            scroller.scrollLeft = to;
            continue;
          }
          await new Promise<void>((resolve) => {
            const scroll = animate(from, to, {
              ...cameraSpring,
              onUpdate: (v) => {
                scroller.scrollLeft = v;
              },
              onComplete: resolve,
            });
            token.stops.push(() => {
              scroll.stop();
              resolve();
            });
          });
          guard();
        }
      };

      const tap = async (target: Target, options?: { click?: boolean }) => {
        await focus(target);
        const el = await find(target);
        await revealHorizontally(el);
        // После докрутки подсветку ставим на саму кнопку, где она теперь.
        await focus(target);
        if (reduceMotion) {
          if (options?.click) el.click();
          return;
        }
        const r = el.getBoundingClientRect();
        const x = r.left + Math.min(r.width / 2, 120);
        const y = r.top + r.height / 2;
        setFinger((f) =>
          f.state === "hidden" ? { x: viewW * 0.7, y: viewH + 40, state: "move" } : f,
        );
        await wait(30);
        setFinger({ x, y, state: "move" });
        await wait(950);
        setFinger({ x, y, state: "press" });
        if (options?.click) el.click();
        await wait(420);
        setFinger({ x, y, state: "move" });
        // Отпустил — и убрал руку: иначе палец висит над тем, что появилось
        // после нажатия, и кажется, будто жмёт туда.
        await wait(300);
        setFinger((f) => ({ ...f, state: "hidden" }));
      };

      const type = async (target: Target, text: string) => {
        const el = (await find(target)) as HTMLInputElement | HTMLTextAreaElement;
        setFinger((f) => ({ ...f, state: "hidden" }));
        el.value = "";
        for (const char of text) {
          await wait(reduceMotion ? 0 : 75 + Math.random() * 70);
          el.value += char;
        }
      };

      const click = (target: Target) => {
        resolveTarget(target)?.click();
      };

      return { doc, device, focus, tap, type, click, wait };
    },
    [reduceMotion, device],
  );

  const stopFreeScroll = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    freeScrollRef.current = false;
    setFreeScroll(false);
  }, []);

  const goTo = useCallback(
    (next: number) => {
      stopFreeScroll();
      cancel(sceneTokenRef.current);
      cancel(exitTokenRef.current);
      busyRef.current = false;
      setBusy(false);
      sceneDoneRef.current = false;
      timeUpRef.current = false;
      progress.set(0);
      setFinger((f) => ({ ...f, state: "hidden" }));
      if (SCENES[next].frame !== SCENES[indexRef.current].frame) setSpot(null);
      setReached((r) => Math.max(r, SCENES[next].chapter));
      setIndex(next);
    },
    [progress, stopFreeScroll],
  );

  // Переход вперёд: сначала палец нажимает то, что вело бы человека дальше,
  // и только потом въезжает следующий экран — без мгновенных перескоков.
  const next = useCallback(async () => {
    const at = indexRef.current;
    if (busyRef.current || at >= SCENES.length - 1) return;
    const current = SCENES[at];
    cancel(sceneTokenRef.current);

    const exitVisible =
      current.exit &&
      frameRefs.current[current.frame]?.contentDocument &&
      (typeof current.exit === "string"
        ? [...frameRefs.current[current.frame]!.contentDocument!.querySelectorAll(current.exit)].some(isVisible)
        : Boolean(current.exit(frameRefs.current[current.frame]!.contentDocument!)));

    if (exitVisible && !reduceMotion) {
      busyRef.current = true;
      setBusy(true);
      const token = newToken();
      exitTokenRef.current = token;
      try {
        const ctx = makeCtx(current.frame, token);
        await ctx.tap(current.exit!);
        await ctx.wait(400);
      } catch {
        return;
      }
    }
    if (indexRef.current === at) goTo(at + 1);
  }, [goTo, makeCtx, reduceMotion]);

  const prev = useCallback(() => {
    if (indexRef.current > 0) goTo(indexRef.current - 1);
  }, [goTo]);

  const maybeAdvance = useCallback(() => {
    if (!autoplayRef.current || !sceneDoneRef.current || !timeUpRef.current) return;
    if (indexRef.current >= SCENES.length - 1) {
      setAutoplay(false);
      return;
    }
    void next();
  }, [next]);

  // Время на странице записи кликается по-настоящему — возвращаем её
  // в исходное состояние, пока она не на экране.
  const resetBook = useCallback(() => {
    const location = frameRefs.current.book?.contentWindow?.location;
    const expected = new URL(frames.book, window.location.origin);
    if (location && location.pathname + location.search !== expected.pathname + expected.search) {
      location.replace(frames.book);
    }
  }, [frames.book]);

  // Сцена при входе разыгрывает свой сценарий. Смена устройства — тоже вход:
  // вёрстка другая, камеру надо поставить заново.
  useEffect(() => {
    if (!frameReady) return;
    const current = SCENES[index];
    if (current.frame !== "book") resetBook();

    const token = newToken();
    sceneTokenRef.current = token;
    (async () => {
      try {
        if (current.frame === "book") {
          // После «назад» страница записи могла ещё не перезагрузиться.
          const expected = new URL(frames.book, window.location.origin);
          for (let i = 0; i < 40; i++) {
            const location = frameRefs.current.book?.contentWindow?.location;
            const doc = frameRefs.current.book?.contentDocument;
            if (
              location &&
              location.pathname + location.search === expected.pathname + expected.search &&
              doc?.readyState === "complete"
            ) {
              break;
            }
            if (i === 0) resetBook();
            await new Promise((r) => setTimeout(r, 120));
            if (token.cancelled) return;
          }
        }
        await current.run(makeCtx(current.frame, token));
        if (token.cancelled) return;
        sceneDoneRef.current = true;
        maybeAdvance();
      } catch {
        // Ушли со сцены — сценарий просто обрывается.
      }
    })();

    return () => cancel(token);
    // replay — намеренная зависимость: повтор шага после свободной прокрутки.
  }, [frameReady, index, replay, makeCtx, maybeAdvance, resetBook, frames.book]);

  // Автопросмотр: полоска сцены заполняется, на паузе замирает.
  useEffect(() => {
    // Пока зритель листает сам, полоска автопросмотра стоит.
    if (!autoplay || !frameReady || freeScroll) return;
    const remaining = (1 - progress.get()) * SCENES[index].ms;
    const controls = animate(progress, 1, {
      duration: remaining / 1000,
      ease: "linear",
      onComplete: () => {
        timeUpRef.current = true;
        maybeAdvance();
      },
    });
    return () => controls.stop();
  }, [autoplay, frameReady, freeScroll, index, progress, maybeAdvance]);

  useEffect(() => {
    scaleRef.current = scale || 1;
  });

  // Колесо и свайп над устройством листают страницу внутри него. Сами iframe
  // остаются без указателя (клик по устройству — «дальше»), поэтому скролл
  // ловим на сцене и передаём в окно страницы с поправкой на масштаб.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const scrollBy = (dy: number) => {
      if (busyRef.current) return false;
      const frame = SCENES[indexRef.current].frame;
      const win = frameRefs.current[frame]?.contentWindow;
      if (!win) return false;

      if (!freeScrollRef.current) {
        freeScrollRef.current = true;
        cancel(sceneTokenRef.current);
        setFinger((f) => ({ ...f, state: "hidden" }));
        setFreeScroll(true);
      }
      win.scrollBy({ top: dy / scaleRef.current, behavior: "instant" });
      lastScrollAtRef.current = Date.now();

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        freeScrollRef.current = false;
        setFreeScroll(false);
        setReplay((n) => n + 1);
      }, FREE_SCROLL_IDLE_MS);
      return true;
    };

    const onWheel = (event: WheelEvent) => {
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (Math.abs(dy) < 1) return;
      if (scrollBy(dy)) event.preventDefault();
    };

    let touchY: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (touchY === null) return;
      const y = event.touches[0].clientY;
      const dy = touchY - y;
      touchY = y;
      if (scrollBy(dy)) event.preventDefault();
    };
    const onTouchEnd = () => {
      touchY = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  useEffect(
    () => () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    },
    [],
  );

  // Стрелки на клавиатуре листают шаги.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") void next();
      if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const switchDevice = (value: DeviceId) => {
    if (value === device) return;
    stopFreeScroll();
    cancel(sceneTokenRef.current);
    cancel(exitTokenRef.current);
    busyRef.current = false;
    setBusy(false);
    setSpot(null);
    setFinger((f) => ({ ...f, state: "hidden" }));
    setDevice(value);
  };

  const toggleAutoplay = () => {
    if (!autoplay && isLast) goTo(0);
    setAutoplay((value) => !value);
  };

  // Выбор цвета страницы: луч от кружка до экрана, затем волна внутри страницы.
  const paint = (id: BookingThemePresetId, event: React.MouseEvent<HTMLButtonElement>) => {
    const target = frameRefs.current.profile?.contentWindow;
    const screenEl = screenRef.current;
    if (painting || id === presetId || !target || !screenEl) return;

    const preset = getBookingThemePreset(id);
    const button = event.currentTarget.getBoundingClientRect();
    const center = { x: button.left + button.width / 2, y: button.top + button.height / 2 };
    const sr = screenEl.getBoundingClientRect();
    const inset = 28;
    // Луч приходит в ближайшую к кружку точку экрана.
    const to = {
      x: Math.min(Math.max(center.x, sr.left + inset), sr.right - inset),
      y: Math.min(Math.max(center.y, sr.top + inset), sr.bottom - inset),
    };
    // …и выходит с края кружка, а не из центра — иначе линии ложатся
    // поверх соседних кружков.
    const distance = Math.hypot(to.x - center.x, to.y - center.y) || 1;
    const edge = button.width / 2 + 6;
    const from = {
      x: center.x + ((to.x - center.x) / distance) * edge,
      y: center.y + ((to.y - center.y) / distance) * edge,
    };

    // Точка на экране → координаты страницы внутри iframe: снимаем масштаб устройства.
    const deviceScale = sr.width / spec.viewW;
    const message: TourThemeMessage = {
      type: TOUR_THEME_MESSAGE,
      presetId: id,
      x: (to.x - sr.left) / deviceScale,
      y: (to.y - sr.top) / deviceScale,
    };

    setPresetId(id);
    if (reduceMotion) {
      target.postMessage(message, window.location.origin);
      return;
    }

    setPainting(true);
    setBeam({
      key: Date.now(),
      from,
      to,
      colors: [
        preset.light["--color-accent-deep"] ?? preset.swatches[1],
        preset.light["--color-accent"] ?? preset.swatches[2],
        preset.swatches[1],
      ],
    });
    setTimeout(() => target.postMessage(message, window.location.origin), BEAM_MS);
    setTimeout(() => setBeam(null), BEAM_MS + 700);
    setTimeout(() => setPainting(false), PAINT_MS);
  };

  const restart = () => {
    setAutoplay(false);
    goTo(0);
  };

  const activeOrder = FRAME_ORDER.indexOf(scene.frame);
  const chapterScenes = SCENES.filter((s) => s.chapter === scene.chapter);
  const stepInChapter = chapterScenes.indexOf(scene);
  const isLaptop = device === "laptop";
  const mounted = framesUpTo(reached);

  const screen = (
    <div
      ref={screenRef}
      className="relative overflow-hidden bg-[var(--color-background)]"
      style={{
        width: spec.viewW,
        height: spec.viewH,
        borderRadius: isLaptop ? 6 : 48,
      }}
    >
      {/* Камера только прокручивает страницу, без наезда: масштаб интерфейса
          всегда один, и при свободной прокрутке он не «дышит». */}
      <div className="absolute inset-0">
        {FRAME_ORDER.map((id, order) => {
          if (!mounted.has(id)) return null;
          const offset = order - activeOrder;
          return (
            <motion.iframe
              key={id}
              ref={(node) => {
                frameRefs.current[id] = node;
              }}
              src={frames[id]}
              title={id}
              tabIndex={-1}
              aria-hidden
              onLoad={() => setLoaded((l) => (l[id] ? l : { ...l, [id]: true }))}
              className="pointer-events-none absolute inset-0 border-0 bg-[var(--color-background)]"
              style={{
                width: spec.viewW,
                height: spec.viewH,
                zIndex: order,
                boxShadow: offset === 0 ? "-16px 0 40px rgba(0,0,0,0.22)" : "none",
              }}
              initial={false}
              animate={
                reduceMotion
                  ? { x: 0, opacity: offset === 0 ? 1 : 0 }
                  : {
                      // Как push в iOS: новый экран въезжает справа,
                      // старый уходит влево на треть и гаснет.
                      x: offset === 0 ? 0 : offset > 0 ? spec.viewW : -spec.viewW * 0.3,
                      opacity: offset < 0 ? 0 : 1,
                    }
              }
              transition={{
                x: pushSpring,
                opacity: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
              }}
            />
          );
        })}

        {/* Затемнение вокруг блока: «дырка» с огромной тенью. */}
        {spot ? (
          <motion.div
            key={`${scene.frame}-${device}`}
            className="pointer-events-none absolute left-0 top-0 z-[60] rounded-[26px]"
            initial={{ x: spot.x, y: spot.y, width: spot.w, height: spot.h, opacity: 0 }}
            // Пока страница перекрашивается, затемнение уходит — волну должно быть видно.
            animate={{ x: spot.x, y: spot.y, width: spot.w, height: spot.h, opacity: painting || freeScroll ? 0 : 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { ...spotSpring, opacity: { duration: 0.5, delay: 0.25 } }
            }
            style={{
              boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4000px rgba(16,17,14,0.46)",
            }}
          />
        ) : null}

        <Pointer finger={finger} device={device} />
      </div>

      {!frameReady ? (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-[var(--color-background)] text-sm text-muted">
          Загружаем демо…
        </div>
      ) : null}
    </div>
  );

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[var(--color-background)]">
      <div
        // Управление всегда сбоку на широком экране: под ноутбуком приходилось
        // выбирать — видеть описание или весь экран.
        className={`mx-auto grid min-h-screen items-center gap-6 px-4 py-6 lg:px-8 ${
          isLaptop
            ? "max-w-[1440px] lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:gap-10"
            : "max-w-6xl lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16"
        }`}
      >
        <div
          ref={stageRef}
          onClick={() => {
            // Палец, только что листавший страницу, — не нажатие «дальше».
            if (Date.now() - lastScrollAtRef.current < 400) return;
            void next();
          }}
          className={`relative mx-auto w-full cursor-pointer ${
            isLaptop
              ? "h-[min(46svh,420px)] sm:h-[min(58svh,660px)] lg:h-[min(86svh,820px)]"
              : "h-[min(56svh,640px)] lg:h-[min(88svh,900px)]"
          }`}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: spec.outerW,
              height: spec.outerH,
              transform: `translate(-50%, -50%) scale(${scale})`,
              opacity: scale ? 1 : 0,
            }}
          >
            {/* Одна и та же вложенность для обоих устройств: иначе React
                пересоздаёт iframe и страницы при переключении грузятся заново. */}
            <div className={isLaptop ? "flex h-full w-full flex-col items-center" : "h-full w-full"}>
              <div
                className={
                  isLaptop
                    ? "rounded-t-[26px] bg-[#141512] p-4 shadow-hover ring-1 ring-white/15"
                    : "h-full w-full rounded-[60px] bg-[#141512] p-3 shadow-hover ring-1 ring-white/15"
                }
              >
                {screen}
              </div>
              {isLaptop ? (
                // Корпус: тонкая полоса с выемкой под пальцы.
                <div className="relative h-[30px] w-full rounded-b-[18px] bg-gradient-to-b from-[#d9dad6] to-[#a9aaa5] shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                  <div className="absolute left-1/2 top-0 h-[10px] w-[180px] -translate-x-1/2 rounded-b-[10px] bg-[#9a9b96]" />
                </div>
              ) : null}
            </div>
          </div>

        </div>

        <div
          className={`relative z-10 mx-auto w-full ${
            isLaptop
              ? "grid max-w-4xl gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:gap-10 lg:block lg:max-w-none lg:space-y-8"
              : "max-w-md space-y-6 lg:max-w-none lg:space-y-8"
          }`}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ChapterTabs
                current={scene.chapter}
                onSelect={(chapter) => {
                  if (!busyRef.current) goTo(CHAPTER_STARTS[chapter]);
                }}
              />
              <DeviceSwitch value={device} onChange={switchDevice} />
            </div>

            <StoryBars
              scenes={chapterScenes}
              active={stepInChapter}
              progress={progress}
              autoplay={autoplay}
              onSelect={(i) => {
                if (!busyRef.current) goTo(SCENES.indexOf(chapterScenes[i]));
              }}
            />

            <div className="min-h-[8.5rem] space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted">
                Глава {scene.chapter + 1} · шаг {stepInChapter + 1} из {chapterScenes.length}
              </p>
              <motion.div
                key={scene.id}
                initial={reduceMotion ? false : { opacity: 0, y: 12, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  {scene.title}
                </h1>
                <p className="text-lg leading-8 text-ink-soft">{scene.text}</p>
              </motion.div>
            </div>

            {scene.chapter === 0 ? (
              <PalettePicker
                value={presetId}
                disabled={painting || !frameReady}
                onPick={paint}
              />
            ) : null}
          </div>

          <div className="space-y-4 self-end">
            {freeScroll ? (
              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="text-sm text-muted"
              >
                Листаешь сам — через 5 секунд вернёмся к шагу.
              </motion.p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={prev}
                disabled={index === 0 || busy}
                aria-label="Предыдущий шаг"
                className="h-12 w-12 shrink-0 !px-0 disabled:pointer-events-none disabled:opacity-40"
              >
                <ArrowLeft size={18} />
              </Button>

              {isLast ? (
                <>
                  <ButtonLink href={registerHref} documentNavigation className="h-12 flex-1 gap-2">
                    Создать свою страницу
                    <ArrowRight size={16} />
                  </ButtonLink>
                  <Button
                    variant="secondary"
                    onClick={restart}
                    aria-label="Сначала"
                    className="h-12 w-12 shrink-0 !px-0"
                  >
                    <RotateCcw size={18} />
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => void next()}
                  disabled={busy}
                  className="h-12 flex-1 gap-2 disabled:pointer-events-none"
                >
                  {isChapterEnd ? `Глава ${scene.chapter + 2}: ${CHAPTERS[scene.chapter + 1].short}` : "Дальше"}
                  <ArrowRight size={16} />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button
                type="button"
                onClick={toggleAutoplay}
                aria-pressed={autoplay}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 font-medium transition active:scale-[0.97] ${
                  autoplay
                    ? "border-transparent bg-accent-soft text-ink"
                    : "border-line text-ink-soft hover:text-ink"
                }`}
              >
                {autoplay ? <Pause size={14} /> : <Play size={14} />}
                Автопросмотр
              </button>
              <a
                href={cleanHref}
                className="text-muted underline-offset-4 transition hover:text-ink hover:underline"
              >
                Открыть профиль без тура
              </a>
            </div>
          </div>
        </div>
      </div>

      {beam ? <PaintBeam beam={beam} /> : null}
    </main>
  );
}

function PalettePicker({
  value,
  disabled,
  onPick,
}: {
  value: BookingThemePresetId;
  disabled: boolean;
  onPick: (id: BookingThemePresetId, event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const active = getBookingThemePreset(value);

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Цвет страницы: <span className="font-medium text-ink">{active.label}</span>
      </p>
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Цвет страницы">
        {bookingThemePresets.map((preset) => {
          const [base, ink, accent] = preset.swatches;
          const isActive = preset.id === value;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={preset.label}
              title={preset.label}
              disabled={disabled && !isActive}
              onClick={(event) => {
                event.stopPropagation();
                onPick(preset.id, event);
              }}
              className={`h-10 w-10 rounded-full border border-black/10 shadow-subtle transition duration-300 active:scale-[0.92] disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive
                  ? "ring-2 ring-ink ring-offset-2 ring-offset-[var(--color-background)]"
                  : "hover:-translate-y-0.5"
              }`}
              style={{
                background: `conic-gradient(from 210deg, ${base} 0 40%, ${accent} 0 75%, ${ink} 0)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Луч от кружка палитры до экрана: три тонкие прямые линии в цветах пресета
 * вытягиваются одна за другой и гаснут. Только transform и opacity — их
 * композитит видеокарта, поэтому линии не подтормаживают, пока внутри
 * страницы уже идёт волна.
 */
function PaintBeam({ beam }: { beam: Beam }) {
  const { from, to } = beam;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const gap = 4;
  const duration = BEAM_MS / 1000;

  return (
    <motion.div
      key={beam.key}
      aria-hidden
      // Под панелью управления (у неё z-10): линии проходят за соседними
      // кружками, но поверх телефона.
      className="pointer-events-none fixed left-0 top-0 z-[5]"
      style={{
        width: length,
        height: gap * (beam.colors.length - 1),
        x: from.x,
        y: from.y - gap,
        rotate: `${angle}rad`,
        originX: 0,
        originY: 0.5,
      }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: duration + 0.15, duration: 0.55, ease: "easeOut" }}
    >
      {beam.colors.map((color, i) => (
        <motion.div
          key={color + i}
          className="absolute left-0 h-[2px] w-full rounded-full"
          style={{ top: i * gap - 1, backgroundColor: color, originX: 0 }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: i * 0.08, duration, ease: [0.65, 0, 0.35, 1] }}
        />
      ))}
    </motion.div>
  );
}

function ChapterTabs({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (chapter: number) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full border border-line p-1">
      {CHAPTERS.map((chapter, i) => (
        <button
          key={chapter.title}
          type="button"
          onClick={() => onSelect(i)}
          aria-current={i === current ? "step" : undefined}
          title={chapter.title}
          className={`relative min-h-9 rounded-full px-3 text-sm transition active:scale-[0.97] ${
            i === current ? "text-ink-contrast" : "text-ink-soft hover:text-ink"
          }`}
        >
          {i === current ? (
            <motion.span
              layoutId="tour-chapter"
              className="absolute inset-0 rounded-full bg-ink"
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
            />
          ) : null}
          <span className="relative">
            {i + 1}. {chapter.short}
          </span>
        </button>
      ))}
    </div>
  );
}

function DeviceSwitch({
  value,
  onChange,
}: {
  value: DeviceId;
  onChange: (value: DeviceId) => void;
}) {
  const options = [
    { id: "phone" as const, label: "Телефон", Icon: Smartphone },
    { id: "laptop" as const, label: "Ноутбук", Icon: Laptop },
  ];

  return (
    <div className="flex gap-1 rounded-full border border-line p-1" role="radiogroup" aria-label="Устройство">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          aria-label={label}
          title={label}
          onClick={() => onChange(id)}
          className={`relative flex h-9 w-10 items-center justify-center rounded-full transition active:scale-[0.95] ${
            value === id ? "text-ink-contrast" : "text-ink-soft hover:text-ink"
          }`}
        >
          {value === id ? (
            <motion.span
              layoutId="tour-device"
              className="absolute inset-0 rounded-full bg-ink"
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
            />
          ) : null}
          <Icon size={16} className="relative" />
        </button>
      ))}
    </div>
  );
}

function StoryBars({
  scenes,
  active,
  progress,
  autoplay,
  onSelect,
}: {
  scenes: Scene[];
  active: number;
  progress: MotionValue<number>;
  autoplay: boolean;
  onSelect: (i: number) => void;
}) {
  const width = useTransform(progress, (v) => `${v * 100}%`);

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${scenes.length}, 1fr)` }}>
      {scenes.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(i)}
          className="group flex flex-col justify-start gap-2 self-start py-1 text-left"
          aria-label={`Шаг ${i + 1}: ${s.title}`}
          aria-current={i === active ? "step" : undefined}
        >
          <span className="block h-1 overflow-hidden rounded-full bg-[var(--color-line)]">
            {i < active || (i === active && !autoplay) ? (
              <span className="block h-full w-full rounded-full bg-ink" />
            ) : i === active ? (
              <motion.span className="block h-full rounded-full bg-ink" style={{ width }} />
            ) : null}
          </span>
          <span
            className={`hidden text-xs transition sm:block ${
              i === active ? "text-ink" : "text-muted group-hover:text-ink-soft"
            }`}
          >
            {s.title}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Палец на телефоне, курсор на ноутбуке. */
function Pointer({ finger, device }: { finger: Finger; device: DeviceId }) {
  const visible = finger.state !== "hidden";
  const pressed = finger.state === "press";
  const isLaptop = device === "laptop";
  const anchor = isLaptop ? 4 : 24;

  return (
    <motion.div
      className="pointer-events-none absolute left-0 top-0 z-[65]"
      initial={false}
      animate={{ x: finger.x - anchor, y: finger.y - anchor, opacity: visible ? 1 : 0 }}
      transition={{
        x: { type: "spring", stiffness: 70, damping: 17 },
        y: { type: "spring", stiffness: 70, damping: 17 },
        opacity: { duration: 0.2 },
      }}
    >
      {isLaptop ? (
        <>
          {pressed ? (
            <motion.div
              className="absolute h-10 w-10 rounded-full border-2 border-[var(--color-accent)]"
              style={{ left: -16, top: -16 }}
              initial={{ scale: 0.4, opacity: 0.9 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          ) : null}
          <motion.svg
            width="28"
            height="36"
            viewBox="0 0 28 36"
            animate={{ scale: pressed ? 0.88 : 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            style={{ originX: 0.15, originY: 0.1, filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.3))" }}
          >
            <path
              d="M4 3 L4 29 L10.5 23 L15 33 L19.5 31 L15 21.5 L23.5 21.5 Z"
              fill="#111"
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </motion.svg>
        </>
      ) : (
        <>
          <motion.div
            className="h-12 w-12 rounded-full border-2 border-white/90 bg-white/45 shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop-blur-sm"
            animate={{ scale: pressed ? 0.78 : 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
          />
          {pressed ? (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-white"
              initial={{ scale: 0.8, opacity: 0.9 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          ) : null}
        </>
      )}
    </motion.div>
  );
}
