"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AnimatePresence,
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
  Send,
  Laptop,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { isVisible, type Target } from "@/components/tour/tour-helpers";
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

export type DeviceId = "phone" | "laptop";

/**
 * Экран тура — настоящая страница в iframe. Порядок экранов в сценарии — как
 * в настоящем пути: по нему решается, откуда въезжает страница (вперёд —
 * справа, назад — слева).
 */
export type TourFrame = {
  id: string;
  /**
   * profile — публичная страница с плавающей кнопкой записи внизу,
   * cabinet — кабинет с нижней панелью на телефоне, page — без закреплённого низа.
   */
  kind: "profile" | "cabinet" | "page";
  /**
   * Сценарий кликает по странице по-настоящему (например, выбирает время) —
   * пока экран не на виду, возвращаем его в исходное состояние.
   */
  resetWhenHidden?: boolean;
  /**
   * Экран второго телефона — «вида клиента». Показывается рядом с основным
   * устройством только в сценах, где он нужен (Scene.companion).
   */
  companion?: boolean;
};

/**
 * Что сцена умеет делать со страницей внутри устройства. Все действия
 * асинхронные и прерываются, если зритель ушёл со сцены.
 */
export type SceneCtx = {
  doc: Document;
  device: DeviceId;
  /** Камера доезжает до элемента, подсветка обводит его. */
  focus: (target: Target) => Promise<void>;
  /** Палец (или курсор) подъезжает и нажимает; click — нажать по-настоящему. */
  tap: (target: Target, options?: { click?: boolean }) => Promise<void>;
  /** Печать по буквам в поле; fast — для длинных текстов. */
  type: (target: Target, text: string, options?: { fast?: boolean }) => Promise<void>;
  /** Мгновенный клик без анимации — вернуть страницу в исходное состояние. */
  click: (target: Target) => void;
  /** Поставить значение полю целиком (время, дата) — так, чтобы React его заметил. */
  setValue: (target: Target, value: string) => Promise<void>;
  /** Уведомление поверх устройства — как пуш от бота. */
  notify: (notice: { app: string; title: string; text: string; ms?: number }) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  /** Второй телефон («вид клиента»), если он есть в сцене. */
  client?: SceneCtx;
};

export type Scene = {
  id: string;
  chapter: number;
  frame: string;
  title: string;
  text: string;
  /** Длительность сцены в автопросмотре. */
  ms: number;
  run: (ctx: SceneCtx) => Promise<void>;
  /** Что нажимает палец при переходе на следующую сцену. Нет на экране — переход без нажатия. */
  exit?: Target;
  /** Экран второго телефона, который выезжает справа на время сцены. */
  companion?: string;
  /** Подпись над вторым телефоном. */
  companionLabel?: string;
};

export type TourChapter = {
  title: string;
  short: string;
  /** Одна строка для оглавления (база знаний). */
  summary?: string;
};

export type TourScript = {
  chapters: TourChapter[];
  scenes: Scene[];
  frames: TourFrame[];
  /** Выбор цвета страницы: в какой главе показывать и какой экран перекрашивать. */
  palette?: { chapter: number; frame: string };
};

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
    safeBottom: (kind: TourFrame["kind"]) =>
      kind === "profile" ? 96 : kind === "cabinet" ? 76 : 20,
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

/** Какие экраны держать загруженными: всё до главы после достигнутой. */
function framesUpTo(scenes: Scene[], chapter: number) {
  return new Set(
    scenes
      .filter((scene) => scene.chapter <= chapter + 1)
      .flatMap((scene) => (scene.companion ? [scene.frame, scene.companion] : [scene.frame])),
  );
}

type Notice = { key: number; app: string; title: string; text: string };

const companionSpring = { type: "spring", stiffness: 90, damping: 20 } as const;

type TourLink = { label: string; href: string };

/**
 * Плеер тура: страницы в рамке телефона или ноутбука, камера, подсветка,
 * палец, автопросмотр и свободная прокрутка. Что показывать — решает
 * сценарий (script); сам плеер о содержании ничего не знает.
 */
export function TourPlayer({
  script,
  frameSrc,
  finale,
  skip,
  variant = "page",
  chapterNav = "tabs",
  initialChapter = 0,
  allChaptersHref,
}: {
  script: TourScript;
  /** Адрес страницы для каждого экрана сценария. */
  frameSrc: Record<string, string>;
  /** Кнопка на последнем шаге. */
  finale: TourLink;
  /** Тихая ссылка «пропустить» под кнопками. */
  skip?: TourLink;
  /** page — плеер на весь экран; embedded — внутри страницы кабинета. */
  variant?: "page" | "embedded";
  /** tabs — переключатель глав; title — заголовок текущей главы (база знаний). */
  chapterNav?: "tabs" | "title";
  initialChapter?: number;
  /** Ссылка «все главы» рядом с заголовком главы. */
  allChaptersHref?: string;
}) {
  const { scenes: SCENES, chapters: CHAPTERS, frames: FRAMES } = script;
  const FRAME_ORDER = FRAMES.filter((frame) => !frame.companion).map((frame) => frame.id);
  const COMPANION_FRAMES = FRAMES.filter((frame) => frame.companion).map((frame) => frame.id);
  const CHAPTER_STARTS = CHAPTERS.map((_, chapter) =>
    SCENES.findIndex((scene) => scene.chapter === chapter),
  );
  const startIndex = Math.max(0, CHAPTER_STARTS[initialChapter] ?? 0);

  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(startIndex);
  const [device, setDevice] = useState<DeviceId>("phone");
  const [autoplay, setAutoplay] = useState(false);
  const [busy, setBusy] = useState(false);
  // Самая дальняя глава, до которой дошёл зритель: её экраны и экраны
  // следующей держим загруженными, остальные не грузим зря.
  const [reached, setReached] = useState(SCENES[startIndex].chapter);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [spot, setSpot] = useState<Rect | null>(null);
  const [finger, setFinger] = useState<Finger>({ x: 0, y: 0, state: "hidden" });
  // Второй телефон («вид клиента») — своя подсветка и свой палец.
  const [clientSpot, setClientSpot] = useState<Rect | null>(null);
  const [clientFinger, setClientFinger] = useState<Finger>({ x: 0, y: 0, state: "hidden" });
  const [notice, setNotice] = useState<Notice | null>(null);
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

  const frameRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);
  const indexRef = useRef(index);
  const scenesRef = useRef(SCENES);
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
    scenesRef.current = SCENES;
  });

  const scene = SCENES[index];
  const spec = DEVICES[device];
  const isLast = index === SCENES.length - 1;
  const isChapterEnd = !isLast && SCENES[index + 1].chapter !== scene.chapter;
  const frameReady = Boolean(loaded[scene.frame]);
  // С «видом клиента» устройства стоят парой: основное сдвигается влево,
  // второй телефон встаёт справа. Телефон рядом с ноутбуком — чуть ниже его.
  const companionId = scene.companion;
  const PHONE = DEVICES.phone;
  const companionRatio = device === "laptop" ? (spec.outerH / PHONE.outerH) * 0.9 : 1;
  const PAIR_GAP = 56;
  const singleScale = stage.width
    ? Math.min(stage.width / spec.outerW, stage.height / spec.outerH, 1)
    : 0;
  const pairScale = stage.width
    ? Math.min(
        stage.height / spec.outerH,
        (stage.width - PAIR_GAP) / (spec.outerW + PHONE.outerW * companionRatio),
        1,
      )
    : 0;
  const scale = companionId ? pairScale : singleScale;
  const companionScale = pairScale * companionRatio;
  const mainShift = companionId ? -(PHONE.outerW * companionScale + PAIR_GAP) / 2 : 0;
  const companionShift = (spec.outerW * pairScale + PAIR_GAP) / 2;

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
    const done = Object.keys(frameRefs.current).filter((id) => {
      const doc = frameRefs.current[id]?.contentDocument;
      return doc?.readyState === "complete" && doc.location.href !== "about:blank";
    });
    if (done.length > 0) {
      setLoaded((l) => ({ ...l, ...Object.fromEntries(done.map((id) => [id, true])) }));
    }
  }, []);

  // Страховка от вечного «Загружаем демо…»: onLoad мог потеряться, а сама
  // загрузка окна — не начаться (так было в Safari на iOS). Досматриваем
  // готовность, через 8 с перезапускаем загрузку, через 20 с честно говорим,
  // что не вышло, и даём обновить страницу.
  const [stuckFrame, setStuckFrame] = useState<string | null>(null);
  const stuckReportedRef = useRef(false);
  // Нарушения CSP на странице плеера — в отчёт о зависшем окне.
  const cspViolationsRef = useRef<string[]>([]);
  useEffect(() => {
    const onViolation = (event: SecurityPolicyViolationEvent) => {
      if (cspViolationsRef.current.length < 10) {
        cspViolationsRef.current.push(`${event.effectiveDirective} ${event.blockedURI}`);
      }
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, []);
  const currentFrame = SCENES[index].frame;
  const currentFrameReady = Boolean(loaded[currentFrame]);
  useEffect(() => {
    if (currentFrameReady) return;
    const id = currentFrame;
    const check = () => {
      const doc = frameRefs.current[id]?.contentDocument;
      if (doc?.readyState === "complete" && doc.location.href !== "about:blank") {
        setLoaded((l) => (l[id] ? l : { ...l, [id]: true }));
        return true;
      }
      return false;
    };
    const poll = setInterval(check, 500);
    // Диагностика: на iPhone демо висело, а воспроизвести не вышло. Один раз
    // за загрузку страницы шлём в ленту ошибок (/admin/errors), что видит
    // плеер: есть ли окно, что у него внутри, какого размера сцена.
    const report = setTimeout(() => {
      if (check() || stuckReportedRef.current) return;
      stuckReportedRef.current = true;
      const iframe = frameRefs.current[id];
      let inner: Record<string, unknown>;
      try {
        const doc = iframe?.contentDocument;
        inner = doc
          ? { readyState: doc.readyState, href: doc.location.href, bodyLength: doc.body?.innerHTML.length ?? null }
          : { contentDocument: null };
      } catch (error) {
        inner = { error: String(error) };
      }
      const stageBox = stageRef.current?.getBoundingClientRect();
      void fetch("/api/observability/client-error", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Tour demo frame not loaded after 10s",
          route: window.location.pathname + window.location.search,
          context: {
            frame: id,
            src: frameSrc[id],
            iframeInDom: Boolean(iframe?.isConnected),
            iframeCount: document.querySelectorAll("iframe").length,
            ...inner,
            stage: stageBox ? [Math.round(stageBox.width), Math.round(stageBox.height)] : null,
            scale: scaleRef.current,
            visibility: document.visibilityState,
            loadingAttr: iframe?.getAttribute("loading") ?? null,
            cspViolations: cspViolationsRef.current,
            userAgent: navigator.userAgent,
          },
        }),
      }).catch(() => {});
    }, 10000);
    const retry = setTimeout(() => {
      const iframe = frameRefs.current[id];
      if (!check() && iframe) iframe.src = frameSrc[id];
    }, 8000);
    const giveUp = setTimeout(() => {
      if (!check()) setStuckFrame(id);
    }, 20000);
    return () => {
      clearInterval(poll);
      clearTimeout(report);
      clearTimeout(retry);
      clearTimeout(giveUp);
    };
  }, [currentFrame, currentFrameReady, frameSrc]);

  const makeCtx = useCallback(
    (frame: string, token: Token, surface: "main" | "client" = "main"): SceneCtx => {
      const win = frameRefs.current[frame]!.contentWindow!;
      const doc = win.document;
      // Второй телефон — всегда телефон, даже когда основное устройство — ноутбук.
      const surfaceDevice: DeviceId = surface === "client" ? "phone" : device;
      const { viewW, viewH, safeTop } = DEVICES[surfaceDevice];
      const safeBottom = DEVICES[surfaceDevice].safeBottom(
        script.frames.find((item) => item.id === frame)?.kind ?? "page",
      );
      const setSurfaceSpot = surface === "client" ? setClientSpot : setSpot;
      const setSurfaceFinger = surface === "client" ? setClientFinger : setFinger;

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
        setSurfaceSpot({
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
          setSurfaceSpot({
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
        setSurfaceFinger((f) =>
          f.state === "hidden" ? { x: viewW * 0.7, y: viewH + 40, state: "move" } : f,
        );
        await wait(30);
        setSurfaceFinger({ x, y, state: "move" });
        await wait(950);
        setSurfaceFinger({ x, y, state: "press" });
        if (options?.click) el.click();
        await wait(420);
        setSurfaceFinger({ x, y, state: "move" });
        // Отпустил — и убрал руку: иначе палец висит над тем, что появилось
        // после нажатия, и кажется, будто жмёт туда.
        await wait(300);
        setSurfaceFinger((f) => ({ ...f, state: "hidden" }));
      };

      // Значение ставим через нативный сеттер и событие input: так его видит
      // и обычное поле, и контролируемое React-ом (у него своё состояние, и
      // простое el.value = … React молча откатил бы).
      const writeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
        const proto =
          el.tagName === "TEXTAREA"
            ? (win as unknown as typeof window).HTMLTextAreaElement.prototype
            : (win as unknown as typeof window).HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
        el.dispatchEvent(new (win as unknown as typeof window).Event("input", { bubbles: true }));
      };

      const type = async (target: Target, text: string, options?: { fast?: boolean }) => {
        const el = (await find(target)) as HTMLInputElement | HTMLTextAreaElement;
        setSurfaceFinger((f) => ({ ...f, state: "hidden" }));
        writeValue(el, "");
        let typed = "";
        for (const char of text) {
          await wait(reduceMotion ? 0 : options?.fast ? 6 + Math.random() * 8 : 75 + Math.random() * 70);
          typed += char;
          writeValue(el, typed);
        }
      };

      const setValue = async (target: Target, value: string) => {
        const el = (await find(target)) as HTMLInputElement;
        writeValue(el, value);
        el.dispatchEvent(new (win as unknown as typeof window).Event("change", { bubbles: true }));
      };

      const notify = async (next: { app: string; title: string; text: string; ms?: number }) => {
        guard();
        setNotice({ key: Date.now(), app: next.app, title: next.title, text: next.text });
        await wait(next.ms ?? 4800);
        setNotice(null);
      };

      const click = (target: Target) => {
        resolveTarget(target)?.click();
      };

      return { doc, device, focus, tap, type, click, setValue, notify, wait };
    },
    [reduceMotion, device, script.frames],
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
      setClientSpot(null);
      setClientFinger((f) => ({ ...f, state: "hidden" }));
      setNotice(null);
      setReached((r) => Math.max(r, SCENES[next].chapter));
      setIndex(next);
    },
    [progress, stopFreeScroll, SCENES],
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
  }, [goTo, makeCtx, reduceMotion, SCENES]);

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
  }, [next, SCENES]);

  // Экраны, по которым сценарий кликает по-настоящему, возвращаем в исходное
  // состояние, пока они не на экране.
  const resetFrame = useCallback(
    (id: string) => {
      const location = frameRefs.current[id]?.contentWindow?.location;
      const expected = new URL(frameSrc[id], window.location.origin);
      if (location && location.pathname + location.search !== expected.pathname + expected.search) {
        location.replace(frameSrc[id]);
      }
    },
    [frameSrc],
  );

  // Перезагрузить экран и дождаться, пока новая страница загрузится.
  const reloadFrame = useCallback(
    async (id: string, token: Token) => {
      for (let i = 0; i < 50 && !frameRefs.current[id]?.contentWindow; i++) {
        await new Promise((r) => setTimeout(r, 120));
        if (token.cancelled) return false;
      }
      const iframe = frameRefs.current[id];
      if (!iframe?.contentWindow) return false;
      const before = iframe.contentDocument;
      iframe.contentWindow.location.replace(frameSrc[id]);
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 120));
        if (token.cancelled) return false;
        const doc = iframe.contentDocument;
        if (doc && doc !== before && doc.readyState === "complete" && doc.location.href !== "about:blank") {
          return true;
        }
      }
      return false;
    },
    [frameSrc],
  );

  // Сцена при входе разыгрывает свой сценарий. Смена устройства — тоже вход:
  // вёрстка другая, камеру надо поставить заново.
  useEffect(() => {
    if (!frameReady) return;
    const current = SCENES[index];
    const resettable = FRAMES.filter((frame) => frame.resetWhenHidden).map((frame) => frame.id);
    resettable.filter((id) => id !== current.frame).forEach(resetFrame);

    const token = newToken();
    sceneTokenRef.current = token;
    (async () => {
      try {
        if (resettable.includes(current.frame)) {
          // После «назад» страница могла ещё не перезагрузиться.
          const expected = new URL(frameSrc[current.frame], window.location.origin);
          for (let i = 0; i < 40; i++) {
            const location = frameRefs.current[current.frame]?.contentWindow?.location;
            const doc = frameRefs.current[current.frame]?.contentDocument;
            if (
              location &&
              location.pathname + location.search === expected.pathname + expected.search &&
              doc?.readyState === "complete"
            ) {
              break;
            }
            if (i === 0) resetFrame(current.frame);
            await new Promise((r) => setTimeout(r, 120));
            if (token.cancelled) return;
          }
        }
        const ctx = makeCtx(current.frame, token);
        if (current.companion) {
          // Второй телефон каждый раз начинает с чистой страницы: закрытый
          // чат, пустая форма — как у клиента, который только что её открыл.
          const ready = await reloadFrame(current.companion, token);
          if (!ready || token.cancelled) return;
          ctx.client = makeCtx(current.companion, token, "client");
        }
        await current.run(ctx);
        if (token.cancelled) return;
        sceneDoneRef.current = true;
        maybeAdvance();
      } catch {
        // Ушли со сцены — сценарий просто обрывается.
      }
    })();

    return () => cancel(token);
    // replay — намеренная зависимость: повтор шага после свободной прокрутки.
  }, [frameReady, index, replay, makeCtx, maybeAdvance, resetFrame, reloadFrame, frameSrc, SCENES, FRAMES]);

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
  }, [autoplay, frameReady, freeScroll, index, progress, maybeAdvance, SCENES]);

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
      const frame = scenesRef.current[indexRef.current].frame;
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
    setClientSpot(null);
    setNotice(null);
    setFinger((f) => ({ ...f, state: "hidden" }));
    setClientFinger((f) => ({ ...f, state: "hidden" }));
    setDevice(value);
  };

  const toggleAutoplay = () => {
    if (!autoplay && isLast) goTo(startIndex);
    setAutoplay((value) => !value);
  };

  // Выбор цвета страницы: луч от кружка до экрана, затем волна внутри страницы.
  const paint = (id: BookingThemePresetId, event: React.MouseEvent<HTMLButtonElement>) => {
    const target = script.palette ? frameRefs.current[script.palette.frame]?.contentWindow : null;
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
    goTo(startIndex);
  };

  const activeOrder = FRAME_ORDER.indexOf(scene.frame);
  const chapterScenes = SCENES.filter((s) => s.chapter === scene.chapter);
  const stepInChapter = chapterScenes.indexOf(scene);
  const isLaptop = device === "laptop";
  const mounted = framesUpTo(SCENES, reached);

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
              src={frameSrc[id]}
              title={id}
              // Safari сам решает, когда грузить iframe, и окно внутри
              // уменьшенного устройства считал невидимым: оставалось about:blank.
              loading="eager"
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

        {/* Пока говорит «вид клиента», основное устройство притушено целиком. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[61] bg-[rgba(16,17,14,0.42)]"
          initial={false}
          animate={{ opacity: companionId ? 1 : 0 }}
          transition={{ duration: 0.5 }}
        />

        <AnimatePresence>
          {notice ? <NoticeBanner key={notice.key} notice={notice} device={device} /> : null}
        </AnimatePresence>
      </div>

      {!frameReady ? (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-[var(--color-background)] px-6 text-center text-sm text-muted">
          {stuckFrame === scene.frame ? (
            <>
              <span>Демо не загружается.</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  window.location.reload();
                }}
                className="pointer-events-auto rounded-full border border-line px-4 py-2 font-medium text-ink"
              >
                Обновить
              </button>
            </>
          ) : (
            "Загружаем демо…"
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <Shell
      className={
        variant === "page"
          ? "relative min-h-screen overflow-x-hidden bg-[var(--color-background)]"
          : "relative"
      }
    >
      <div
        // Управление всегда сбоку на широком экране: под ноутбуком приходилось
        // выбирать — видеть описание или весь экран.
        className={`mx-auto grid items-center gap-6 ${
          variant === "page" ? "min-h-screen px-4 py-6 lg:px-8" : "py-2"
        } ${
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
          {/* Устройство появляется только после замера сцены: иначе пружина
              масштаба «вырастила» бы его из нуля. */}
          {scale ? (
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: spec.outerW,
              height: spec.outerH,
              marginLeft: -spec.outerW / 2,
              marginTop: -spec.outerH / 2,
            }}
          >
           <motion.div
            className="h-full w-full"
            initial={false}
            animate={{ x: mainShift, scale }}
            transition={reduceMotion ? { duration: 0 } : companionSpring}
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
           </motion.div>
          </div>
          ) : null}

          {scale && COMPANION_FRAMES.length > 0 ? (
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{
                width: PHONE.outerW,
                height: PHONE.outerH,
                marginLeft: -PHONE.outerW / 2,
                marginTop: -PHONE.outerH / 2,
              }}
            >
              <motion.div
                className="relative h-full w-full"
                initial={false}
                animate={{
                  x: companionId ? companionShift : companionShift + 80,
                  scale: companionScale || 0.5,
                  opacity: companionId ? 1 : 0,
                }}
                transition={reduceMotion ? { duration: 0 } : companionSpring}
              >
                <div className="absolute inset-x-0 -top-[84px] flex justify-center">
                  <span className="rounded-full bg-ink px-6 py-3 text-[26px] font-medium text-ink-contrast shadow-hover">
                    {scene.companionLabel ?? "Так видит клиент"}
                  </span>
                </div>
                <div className="h-full w-full rounded-[60px] bg-[#141512] p-3 shadow-hover ring-1 ring-white/15">
                  <div
                    className="relative overflow-hidden rounded-[48px] bg-[var(--color-background)]"
                    style={{ width: PHONE.viewW, height: PHONE.viewH }}
                  >
                    {COMPANION_FRAMES.map((id) =>
                      mounted.has(id) ? (
                        <iframe
                          key={id}
                          ref={(node) => {
                            frameRefs.current[id] = node;
                          }}
                          src={frameSrc[id]}
                          title={id}
                          loading="eager"
                          tabIndex={-1}
                          onLoad={() => setLoaded((l) => (l[id] ? l : { ...l, [id]: true }))}
                          className="pointer-events-none absolute inset-0 border-0 bg-[var(--color-background)]"
                          style={{
                            width: PHONE.viewW,
                            height: PHONE.viewH,
                            opacity: companionId === id ? 1 : 0,
                          }}
                        />
                      ) : null,
                    )}
                    {clientSpot ? (
                      <motion.div
                        className="pointer-events-none absolute left-0 top-0 z-[60] rounded-[26px]"
                        initial={{ x: clientSpot.x, y: clientSpot.y, width: clientSpot.w, height: clientSpot.h, opacity: 0 }}
                        animate={{ x: clientSpot.x, y: clientSpot.y, width: clientSpot.w, height: clientSpot.h, opacity: 1 }}
                        transition={reduceMotion ? { duration: 0 } : { ...spotSpring, opacity: { duration: 0.5, delay: 0.25 } }}
                        style={{
                          boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4000px rgba(16,17,14,0.46)",
                        }}
                      />
                    ) : null}
                    <Pointer finger={clientFinger} device="phone" />
                  </div>
                </div>
              </motion.div>
            </div>
          ) : null}

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
              {chapterNav === "tabs" ? (
                <ChapterTabs
                  chapters={CHAPTERS}
                  current={scene.chapter}
                  onSelect={(chapter) => {
                    if (!busyRef.current) goTo(CHAPTER_STARTS[chapter]);
                  }}
                />
              ) : (
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
                    Глава {scene.chapter + 1} из {CHAPTERS.length}
                  </p>
                  <p className="text-lg font-semibold text-ink">{CHAPTERS[scene.chapter].title}</p>
                  {allChaptersHref ? (
                    <a
                      href={allChaptersHref}
                      className="inline-flex items-center gap-1 text-sm text-muted underline-offset-4 transition hover:text-ink hover:underline"
                    >
                      <ArrowLeft size={14} />
                      Все главы
                    </a>
                  ) : null}
                </div>
              )}
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
                {chapterNav === "tabs" ? `Глава ${scene.chapter + 1} · ` : ""}шаг {stepInChapter + 1} из{" "}
                {chapterScenes.length}
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

            {script.palette && scene.chapter === script.palette.chapter ? (
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
                  <ButtonLink href={finale.href} documentNavigation className="h-12 flex-1 gap-2">
                    {finale.label}
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
              {skip ? (
                <a
                  href={skip.href}
                  className="text-muted underline-offset-4 transition hover:text-ink hover:underline"
                >
                  {skip.label}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {beam ? <PaintBeam beam={beam} /> : null}
    </Shell>
  );
}

function Shell({ className, children }: { className: string; children: React.ReactNode }) {
  return <section className={className}>{children}</section>;
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
  chapters,
  current,
  onSelect,
}: {
  chapters: TourChapter[];
  current: number;
  onSelect: (chapter: number) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full border border-line p-1">
      {chapters.map((chapter, i) => (
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
    // minmax(0, 1fr): длинное слово в подписи («сертификата») не распирает
    // колонку — иначе последние шаги уезжают за край узкой колонки.
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${scenes.length}, minmax(0, 1fr))` }}
    >
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
            className={`hidden text-xs transition [overflow-wrap:anywhere] [hyphens:auto] sm:block ${
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

/** Пуш поверх устройства: баннер сверху на телефоне, карточка справа на ноутбуке. */
function NoticeBanner({ notice, device }: { notice: Notice; device: DeviceId }) {
  const isLaptop = device === "laptop";
  return (
    <motion.div
      className={`pointer-events-none absolute z-[75] flex items-start gap-3 border border-black/5 bg-white/90 shadow-hover backdrop-blur-xl ${
        isLaptop ? "right-5 top-5 w-[380px] rounded-[18px] p-4" : "inset-x-3 top-3 rounded-[24px] p-3.5"
      }`}
      initial={{ opacity: 0, y: -40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#2AABEE] text-white">
        <Send size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-[#111]">{notice.title}</span>
          <span className="shrink-0 text-[11px] text-[#8a8a8e]">сейчас · {notice.app}</span>
        </span>
        <span className="mt-0.5 block text-[13px] leading-[1.35] text-[#3a3a3c]">{notice.text}</span>
      </span>
    </motion.div>
  );
}
