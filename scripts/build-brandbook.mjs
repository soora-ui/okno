// Собирает папку «брендбук/» из живых источников дизайна:
//   - src/app/globals.css — базовые токены приложения (светлая и тёмная тема);
//   - src/lib/booking-theme-presets.ts — пять тем публичной страницы мастера.
// Значения не копируются руками, поэтому после правки палитры достаточно
// перезапустить: `node scripts/build-brandbook.mjs` (Node ≥ 22.18 — сам
// снимает типы с .ts-файла пресетов).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bookingThemePresets,
  defaultBookingThemePresetId,
} from "../src/lib/booking-theme-presets.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "брендбук");
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");

/** Тело блока `{ … }`, открывающегося на позиции start (с учётом вложенности). */
function blockBody(css, start) {
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("Незакрытый блок в globals.css");
}

function parseVars(body) {
  const vars = {};
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]] = match[2].replace(/\s+/g, " ").trim();
  }
  return vars;
}

const baseLight = parseVars(blockBody(globalsCss, globalsCss.indexOf(":root {")));
const darkMedia = globalsCss.indexOf("@media (prefers-color-scheme: dark)");
const baseDark = parseVars(blockBody(globalsCss, globalsCss.indexOf(":root", darkMedia)));
const motionRoot = globalsCss.indexOf(":root {", globalsCss.indexOf("@theme inline"));
const motion = parseVars(blockBody(globalsCss, motionRoot));

// Роли токенов — человеческие имена для таблиц брендбука.
const roles = {
  "--color-background": ["Бумага", "Фон всех страниц. Никогда не белый."],
  "--color-panel": ["Панель", "Вторичные подложки: бейджи, секции, неактивные вкладки."],
  "--color-panel-strong": ["Панель плотная", "Подложка поплотнее, вложенные блоки."],
  "--color-line": ["Линия", "Граница. Обводит каждую поверхность."],
  "--color-ink": ["Чернила", "Основной текст и заливка главной кнопки."],
  "--color-ink-soft": ["Чернила мягкие", "Вторичный текст, навигация."],
  "--color-muted": ["Приглушённый", "Подписи, подсказки, мета-информация."],
  "--color-accent": ["Шалфей", "Единственный акцент: активные состояния, выбранный слот."],
  "--color-accent-soft": ["Шалфей светлый", "Подложка акцентных бейджей."],
  "--color-accent-deep": ["Шалфей глубокий", "Текст на шалфейной подложке, кольцо фокуса."],
  "--color-surface": ["Поверхность", "Карточки, шапка, поля — лежит на бумаге."],
  "--color-surface-strong": ["Поверхность плотная", "Поднятая поверхность внутри карточки."],
  "--color-ink-contrast": ["Текст на чернилах", "Текст на тёмной заливке."],
  "--color-success": ["Успех", "Подтверждённые записи, зелёный бейдж надёжности."],
  "--color-success-soft": ["Успех — подложка", ""],
  "--color-warning": ["Внимание", "Истекающие сроки, жёлтый бейдж."],
  "--color-warning-soft": ["Внимание — подложка", ""],
  "--color-danger": ["Опасность", "Отмены, неявки, деструктивные действия."],
  "--color-danger-soft": ["Опасность — подложка", ""],
  "--color-danger-border": ["Опасность — граница", ""],
  "--color-glow-cool": ["Холодное свечение", "Шалфейное пятно в левом верхнем углу фона."],
  "--color-glow-warm": ["Тёплое свечение", "Персиковое пятно в правом нижнем углу фона."],
  "--ui-card-bg": ["Фон карточки", "Компонент Card."],
  "--ui-field-bg": ["Фон поля", "Input, Textarea, Select."],
  "--ui-placeholder": ["Плейсхолдер", "Текст-подсказка в поле."],
  "--ui-primary-bg": ["Главная кнопка", "Заливка primary-кнопки."],
  "--ui-primary-text": ["Текст главной кнопки", ""],
  "--ui-secondary-bg": ["Вторичная кнопка", "Заливка secondary-кнопки."],
  "--ui-secondary-text": ["Текст вторичной кнопки", ""],
  "--ui-secondary-border": ["Граница вторичной кнопки", ""],
  "--ui-ghost-text": ["Текст ghost-кнопки", ""],
  "--public-surface": ["Стекло страницы", "Полупрозрачные блоки публичной страницы."],
  "--public-surface-strong": ["Стекло плотное", "Шапка и плотные блоки публичной страницы."],
  "--public-edge": ["Блик края", "Светлая кромка стеклянных блоков."],
  "--public-glow-a": ["Свечение A", "Акцентное пятно фона."],
  "--public-glow-b": ["Свечение B", "Светлое пятно фона."],
  "--public-glow-c": ["Свечение C", "Фоновая вуаль."],
};

const colorGroups = [
  ["Нейтрали бумаги", ["--color-background", "--color-panel", "--color-panel-strong", "--color-line", "--color-surface", "--color-surface-strong"]],
  ["Чернила", ["--color-ink", "--color-ink-soft", "--color-muted", "--color-ink-contrast"]],
  ["Акцент — шалфей", ["--color-accent", "--color-accent-soft", "--color-accent-deep"]],
  ["Статусы", ["--color-success", "--color-success-soft", "--color-warning", "--color-warning-soft", "--color-danger", "--color-danger-soft", "--color-danger-border"]],
  ["Свечения фона", ["--color-glow-cool", "--color-glow-warm"]],
  ["Компоненты", ["--ui-card-bg", "--ui-field-bg", "--ui-placeholder", "--ui-primary-bg", "--ui-primary-text", "--ui-secondary-bg", "--ui-secondary-border"]],
];

const pick = (vars, prefixes) =>
  Object.fromEntries(
    Object.entries(vars).filter(([name]) => prefixes.some((p) => name.startsWith(p))),
  );

const typography = [
  { role: "Display", size: "48px", weight: 600, lineHeight: 1.1, tracking: "-0.025em", use: "Первый экран лендинга, крупные секции (36–48px)." },
  { role: "Headline", size: "30px", weight: 600, lineHeight: 1.2, tracking: "-0.025em", use: "Заголовки секций внутри страниц." },
  { role: "Title", size: "20px", weight: 600, lineHeight: 1.3, tracking: "normal", use: "Карточки, названия услуг, шапки модалок (20–24px)." },
  { role: "Body", size: "15px", weight: 400, lineHeight: 1.5, tracking: "normal", use: "Рабочий кегль всего интерфейса; 16px — для длинного чтения." },
  { role: "Label", size: "11px", weight: 500, lineHeight: 1.2, tracking: "0.2em", use: "Надзаголовки и метки. Только UPPERCASE с разрядкой 0.18–0.24em." },
];

// Фото-палитры, с которых снимались темы (папка «цвета/» в корне репозитория).
const references = {
  merlot: "photo_2026-04-19 15.42.52.jpeg",
  lagoon: "photo_2026-04-19 15.42.54.jpeg",
  rosewood: "photo_2026-04-19 15.42.57.jpeg",
};
const unusedReferences = [
  "photo_2026-04-19 15.42.59.jpeg",
  "photo_2026-04-19 15.43.01.jpeg",
  "photo_2026-04-19 15.43.03.jpeg",
];

const themes = bookingThemePresets.map((preset) => ({
  id: preset.id,
  label: preset.label,
  description: preset.description,
  isDefault: preset.id === defaultBookingThemePresetId,
  swatches: preset.swatches,
  darkSwatches: preset.darkSwatches,
  reference: references[preset.id] ?? null,
  light: preset.light,
  dark: preset.dark,
}));

const tokens = {
  $comment:
    "Сгенерировано scripts/build-brandbook.mjs из src/app/globals.css и src/lib/booking-theme-presets.ts. Руками не править.",
  font: {
    sans: baseLight["--font-manrope"],
    mono: baseLight["--font-geist-mono"],
    weights: { interface: 500, heading: 600, body: 400 },
  },
  typography,
  color: { light: pick(baseLight, ["--color-", "--ui-"]), dark: pick(baseDark, ["--color-", "--ui-"]) },
  radius: pick(baseLight, ["--radius-"]),
  shadow: { light: pick(baseLight, ["--shadow-"]), dark: pick(baseDark, ["--shadow-"]) },
  gradient: { light: baseLight["--gradient-ink"], dark: baseDark["--gradient-ink"] },
  motion: {
    "ease-out-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
    "ease-spring-soft": motion["--ease-spring-soft"],
    durations: { pageEnter: "420ms", cardHover: "360ms", morphOpen: "500ms", morphClose: "220ms" },
  },
  publicThemes: themes,
};

// ---------- CSS ----------

const declBlock = (vars, indent = "  ") =>
  Object.entries(vars)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join("\n");

const baseCss = `/* Базовые токены okno. Сгенерировано из src/app/globals.css — не править руками. */
:root {
${declBlock(pick(baseLight, ["--font-", "--color-", "--ui-", "--radius-", "--shadow-", "--gradient-"]))}
  --ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
${declBlock(pick(baseDark, ["--color-", "--ui-", "--shadow-", "--gradient-"]), "    ")}
  }
}
`;

const themesCss = `/* Темы публичной страницы мастера. Сгенерировано из src/lib/booking-theme-presets.ts.
   Подключение: <div data-booking-theme="olive">…</div>
   Принудительная тема: data-booking-theme-mode="light" | "dark". */
${themes
  .map((t) => {
    const sel = `[data-booking-theme="${t.id}"]`;
    return `/* ${t.label} — ${t.description} */
${sel},
${sel}[data-booking-theme-mode="light"] {
  color-scheme: light;
${declBlock(t.light)}
}

@media (prefers-color-scheme: dark) {
  ${sel}:not([data-booking-theme-mode="light"]) {
    color-scheme: dark;
${declBlock(t.dark, "    ")}
  }
}

${sel}[data-booking-theme-mode="dark"] {
  color-scheme: dark;
${declBlock(t.dark)}
}
`;
  })
  .join("\n")}`;

// ---------- HTML ----------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function swatch(name, light, dark) {
  const [title, role] = roles[name] ?? [name, ""];
  return `<div class="sw">
  <div class="sw-chips"><span style="background:${light}"></span>${dark ? `<span style="background:${dark}"></span>` : ""}</div>
  <div class="sw-meta"><b>${esc(title)}</b><code>${name}</code>
  <span class="sw-val">${esc(light)}${dark ? ` · <i>тёмная</i> ${esc(dark)}` : ""}</span>
  ${role ? `<span class="sw-role">${esc(role)}</span>` : ""}</div>
</div>`;
}

function themeMock(theme, mode) {
  return `<div class="mock" data-booking-theme="${theme.id}" data-booking-theme-mode="${mode}">
  <div class="mock-glow"></div>
  <div class="mock-inner">
    <div class="mock-head"><span class="mock-ava">А</span><div><b>Анна · брови и ресницы</b><small>Москва, Патриаршие</small></div></div>
    <div class="mock-card">
      <div class="mock-row"><div><b>Ламинирование ресниц</b><small>1 ч 30 мин</small></div><b>2 500 ₽</b></div>
      <div class="mock-slots"><span>10:00</span><span class="on">12:30</span><span>15:00</span></div>
      <input class="mock-input" placeholder="Ваше имя" />
      <div class="mock-btns"><span class="btn-p">Записаться</span><span class="btn-s">Портфолио</span></div>
    </div>
    <span class="mock-badge">свободно завтра</span>
  </div>
</div>`;
}

function themeTable(theme) {
  const names = Object.keys(theme.light);
  return `<table class="tt"><thead><tr><th>Токен</th><th>Светлая</th><th>Тёмная</th></tr></thead><tbody>
${names
  .map(
    (n) =>
      `<tr><td><code>${n}</code>${roles[n] ? `<small>${esc(roles[n][0])}</small>` : ""}</td><td><span class="dot" style="background:${theme.light[n]}"></span>${esc(theme.light[n])}</td><td><span class="dot" style="background:${theme.dark[n]}"></span>${esc(theme.dark[n])}</td></tr>`,
  )
  .join("\n")}
</tbody></table>`;
}

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>okno · брендбук</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&display=swap" />
<link rel="stylesheet" href="tokens/base.css" />
<link rel="stylesheet" href="tokens/public-themes.css" />
<style>
@font-face { font-family: "Manrope Local"; src: url("fonts/Manrope-Medium.ttf"); font-weight: 500; }
@font-face { font-family: "Manrope Local"; src: url("fonts/Manrope-Bold.ttf"); font-weight: 600 700; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--color-background); color: var(--color-ink);
  font-family: Manrope, "Manrope Local", "Avenir Next", "Segoe UI", sans-serif; font-size: 15px; line-height: 1.5; }
body::before { content: ""; position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(circle at top left, var(--color-glow-cool), transparent 30%),
              radial-gradient(circle at bottom right, var(--color-glow-warm), transparent 30%); }
main { position: relative; max-width: 1180px; margin: 0 auto; padding: 24px 16px 96px; }
header.top { position: sticky; top: 16px; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 16px; border: 1px solid var(--color-line); border-radius: 9999px; background: var(--color-surface); }
.logo { display: flex; align-items: center; gap: 12px; font-weight: 600; }
.mark { display: inline-flex; width: 40px; height: 40px; border-radius: 50%; align-items: center; justify-content: center;
  background: var(--color-ink); color: var(--color-ink-contrast); font-weight: 600; }
nav { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; }
nav a { color: var(--color-ink-soft); text-decoration: none; }
.label { font-size: 11px; font-weight: 500; letter-spacing: .2em; text-transform: uppercase; color: var(--color-muted); }
h1 { font-size: clamp(36px, 6vw, 56px); font-weight: 600; letter-spacing: -.025em; line-height: 1.05; margin: 12px 0 16px; }
h2 { font-size: 30px; font-weight: 600; letter-spacing: -.025em; line-height: 1.2; margin: 8px 0 8px; }
h3 { font-size: 20px; font-weight: 600; margin: 24px 0 12px; }
p.lead { max-width: 680px; color: var(--color-ink-soft); font-size: 17px; }
section { margin-top: 32px; padding: 32px; border: 1px solid var(--color-line); border-radius: var(--radius-section);
  background: var(--color-surface); box-shadow: var(--shadow-section); }
.muted { color: var(--color-muted); }
code { font-family: var(--font-geist-mono); font-size: 12px; color: var(--color-ink-soft); }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.sw { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--color-line); border-radius: var(--radius-panel); background: var(--color-background); }
.sw-chips { display: flex; flex-direction: column; gap: 4px; }
.sw-chips span { width: 48px; height: 32px; border-radius: 10px; border: 1px solid rgba(0,0,0,.08); }
.sw-chips span:only-child { height: 68px; }
.sw-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13px; }
.sw-val { font-size: 12px; color: var(--color-ink-soft); }
.sw-role { font-size: 12px; color: var(--color-muted); }
.type-row { display: grid; grid-template-columns: 160px 1fr; gap: 16px; padding: 16px 0; border-top: 1px solid var(--color-line); align-items: baseline; }
.type-row:first-of-type { border-top: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 16px; }
.radius-box { width: 96px; height: 96px; border: 1px solid var(--color-line); background: var(--color-panel); display: flex; align-items: flex-end; justify-content: center; padding: 8px; font-size: 12px; }
.shadow-box { width: 180px; height: 110px; border: 1px solid var(--color-line); border-radius: var(--radius-card); background: var(--color-surface); display: flex; align-items: center; justify-content: center; font-size: 12px; text-align: center; padding: 8px; }
.demo-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.btn { display: inline-flex; align-items: center; height: 44px; padding: 0 20px; border-radius: 9999px; font-weight: 500; border: 1px solid transparent; }
.btn-primary { background: var(--ui-primary-bg); color: var(--ui-primary-text); }
.btn-secondary { background: var(--ui-secondary-bg); color: var(--ui-secondary-text); border-color: var(--ui-secondary-border); }
.btn-ghost { color: var(--ui-ghost-text); }
.badge { display: inline-flex; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; }
.field { height: 48px; padding: 0 16px; border-radius: var(--radius-field); border: 1px solid var(--color-line); background: var(--ui-field-bg); color: var(--color-ink); font: inherit; min-width: 240px; }
.curve { width: 100%; max-width: 360px; height: 6px; border-radius: 9999px; background: var(--color-panel); position: relative; overflow: hidden; }
.curve::after { content: ""; position: absolute; inset: 0; width: 40%; border-radius: inherit; background: var(--color-accent);
  animation: slide 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate; }
@keyframes slide { to { transform: translateX(150%); } }
.theme { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--color-line); }
.theme:first-of-type { margin-top: 0; padding-top: 0; border-top: 0; }
.theme-head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; justify-content: space-between; }
.theme-swatches { display: flex; gap: 6px; }
.theme-swatches span { width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(0,0,0,.1); }
.theme-body { display: grid; gap: 16px; grid-template-columns: 1fr 1fr 220px; margin-top: 16px; }
.theme-ref img { width: 100%; border-radius: var(--radius-panel); border: 1px solid var(--color-line); display: block; }
details { margin-top: 12px; }
summary { cursor: pointer; font-size: 13px; color: var(--color-ink-soft); }
.tt { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
.tt th, .tt td { text-align: left; padding: 6px 8px; border-top: 1px solid var(--color-line); vertical-align: middle; }
.tt td small { display: block; color: var(--color-muted); }
.dot { display: inline-block; width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(0,0,0,.1); margin-right: 6px; vertical-align: -2px; }
.overflow { overflow-x: auto; }

/* Мокап публичной страницы — красится только переменными темы. */
.mock { position: relative; overflow: hidden; border-radius: var(--radius-card); background: var(--color-background); color: var(--color-ink);
  border: 1px solid var(--color-line); padding: 16px; min-height: 300px; }
.mock-glow { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 15% 0%, var(--public-glow-a), transparent 45%),
              radial-gradient(circle at 90% 20%, var(--public-glow-b), transparent 40%),
              radial-gradient(circle at 50% 100%, var(--public-glow-c), transparent 55%); }
.mock-inner { position: relative; display: flex; flex-direction: column; gap: 12px; }
.mock-head { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 9999px; background: var(--public-surface-strong); border: 1px solid var(--public-edge); }
.mock-head small, .mock-row small { display: block; color: var(--color-muted); font-size: 12px; }
.mock-head b { font-size: 14px; }
.mock-ava { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-accent); color: var(--ui-primary-text); font-weight: 600; }
.mock-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: var(--radius-nested); background: var(--ui-card-bg); border: 1px solid var(--color-line); }
.mock-row { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
.mock-slots { display: flex; gap: 6px; }
.mock-slots span { padding: 6px 12px; border-radius: 9999px; border: 1px solid var(--color-line); background: var(--color-panel); font-size: 13px; color: var(--color-ink-soft); }
.mock-slots .on { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent-deep); font-weight: 600; }
.mock-input { height: 40px; padding: 0 14px; border-radius: 14px; border: 1px solid var(--color-line); background: var(--ui-field-bg); color: var(--color-ink); font: inherit; font-size: 14px; }
.mock-input::placeholder { color: var(--ui-placeholder); }
.mock-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.mock-btns span { display: inline-flex; align-items: center; height: 38px; padding: 0 16px; border-radius: 9999px; font-size: 14px; font-weight: 500; }
.mock .btn-p { background: var(--ui-primary-bg); color: var(--ui-primary-text); }
.mock .btn-s { background: var(--ui-secondary-bg); border: 1px solid var(--ui-secondary-border); color: var(--color-ink); }
.mock-badge { align-self: flex-start; padding: 4px 12px; border-radius: 9999px; background: var(--public-surface); border: 1px solid var(--public-edge); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--color-accent-deep); }
.mock-cap { font-size: 12px; color: var(--color-muted); margin-bottom: 6px; }
.unused { display: flex; gap: 12px; flex-wrap: wrap; }
.unused img { width: 160px; border-radius: var(--radius-panel); border: 1px solid var(--color-line); }

@media (max-width: 860px) {
  .theme-body { grid-template-columns: 1fr; }
  .theme-ref { max-width: 260px; }
  section { padding: 20px; }
  nav { display: none; }
  .type-row { grid-template-columns: 1fr; gap: 4px; }
}
</style>
</head>
<body>
<main>
<header class="top">
  <div class="logo"><span class="mark">o</span>okno <span class="label" style="margin-left:4px">брендбук</span></div>
  <nav><a href="#logo">Логотип</a><a href="#colors">Цвета</a><a href="#type">Шрифт</a><a href="#shape">Формы</a><a href="#components">Компоненты</a><a href="#themes">Темы страницы</a></nav>
</header>

<div style="padding:56px 8px 8px">
  <span class="label">Creative North Star</span>
  <h1>Свет из окна</h1>
  <p class="lead">Тёплая бумага вместо белого, чернила вместо чёрного, шалфей — единственный цветной голос.
  Тень — это дневной свет на листе, а не уровень. Граница есть у всего. Скругления крупные, движение мягкое и на одной кривой.</p>
  <p class="muted" style="font-size:13px">Страница собрана из кода сайта: <code>src/app/globals.css</code> и <code>src/lib/booking-theme-presets.ts</code>. Тёмная тема — по настройке системы.</p>
</div>

<section id="logo">
  <span class="label">01</span><h2>Логотип</h2>
  <p class="muted">Знак — строчная «o» в круге цвета чернил; рядом — слово «okno» строчными, Manrope 600. Никаких заглавных и градиентов.</p>
  <div class="demo-row" style="gap:24px;margin-top:16px">
    <div class="logo" style="font-size:20px"><span class="mark" style="width:56px;height:56px;font-size:22px">o</span>okno</div>
    <div class="logo" style="padding:16px 20px;border-radius:9999px;background:#23241f;color:#faf7f1"><span class="mark" style="background:#faf7f1;color:#23241f">o</span>okno</div>
    <img src="logo/logo.png" alt="Знак okno" width="72" height="72" style="border-radius:50%" />
    <img src="logo/okno-mark.svg" alt="Знак okno, SVG" width="72" height="72" />
  </div>
  <p class="muted" style="font-size:13px;margin-top:16px">Файлы: <code>logo/logo.png</code> (512×512, как на сайте), <code>logo/okno-mark.svg</code>, <code>logo/okno-mark-inverse.svg</code>, <code>logo/okno-lockup.svg</code>.</p>
</section>

<section id="colors">
  <span class="label">02</span><h2>Цвета приложения</h2>
  <p class="muted">В каждой плашке верхний чип — светлая тема (каноническая), нижний — тёмная. Шалфей занимает не больше 10% экрана; зелёный, жёлтый и красный — только для статусов.</p>
  ${colorGroups
    .map(
      ([title, names]) =>
        `<h3>${esc(title)}</h3><div class="grid">${names.map((n) => swatch(n, baseLight[n], baseDark[n])).join("")}</div>`,
    )
    .join("\n")}
  <h3>Градиент чернил</h3>
  <div class="grid">
    <div class="sw"><div class="sw-chips"><span style="background:${baseLight["--gradient-ink"]}"></span><span style="background:${baseDark["--gradient-ink"]}"></span></div>
    <div class="sw-meta"><b>Единственный градиент</b><code>--gradient-ink</code><span class="sw-val">${esc(baseLight["--gradient-ink"])}</span><span class="sw-role">Тёмные промо-блоки и плашки.</span></div></div>
  </div>
</section>

<section id="type">
  <span class="label">03</span><h2>Шрифт — Manrope</h2>
  <p class="muted">Одна гарнитура на всё: Manrope (переменный, 200–800, латиница + кириллица), фолбэк Avenir Next → Segoe UI → sans-serif.
  Живут два веса: 500 для интерфейса и 600 для заголовков, 400 — для текста. Bold и light не используются.
  Моно — Geist Mono, почти не встречается.</p>
  <div style="margin-top:16px">
  ${typography
    .map(
      (t) => `<div class="type-row"><div><b>${t.role}</b><br><code>${t.size} · ${t.weight} · lh ${t.lineHeight} · ${t.tracking}</code><br><small class="muted">${esc(t.use)}</small></div>
      <div style="font-size:${t.size};font-weight:${t.weight};line-height:${t.lineHeight};letter-spacing:${t.tracking};${t.role === "Label" ? "text-transform:uppercase;color:var(--color-muted)" : ""}">${t.role === "Label" ? "Почему okno" : t.role === "Body" ? "Клиент выбирает услугу, время и записывается за минуту — без звонков и переписки." : "Свободное окошко на завтра"}</div></div>`,
    )
    .join("")}
  </div>
  <div class="demo-row" style="margin-top:16px;font-size:28px;gap:32px">
    <span style="font-weight:400">Аа 400</span><span style="font-weight:500">Аа 500</span><span style="font-weight:600">Аа 600</span>
  </div>
  <p class="muted" style="font-size:13px">На сайте шрифт грузится через <code>next/font/google</code>. Файлы для макетов — в <code>fonts/</code>; полный переменный Manrope — fonts.google.com/specimen/Manrope (OFL).</p>
</section>

<section id="shape">
  <span class="label">04</span><h2>Формы, тени, движение</h2>
  <h3>Скругления</h3>
  <p class="muted">Радиус растёт с площадью; вложенный элемент мягче родителя на шаг. Кнопки, бейджи и шапка — пилюли.</p>
  <div class="chips">
    ${Object.entries(pick(baseLight, ["--radius-"]))
      .map(([n, v]) => `<div class="radius-box" style="border-radius:${v}"><span>${n.replace("--radius-", "")} · ${v}</span></div>`)
      .join("")}
    <div class="radius-box" style="border-radius:9999px"><span>pill</span></div>
  </div>
  <h3>Тени — это свет</h3>
  <p class="muted">Большое размытие, 8% в покое. Пять ролей.</p>
  <div class="chips">
    ${Object.entries(pick(baseLight, ["--shadow-"]))
      .map(([n, v]) => `<div class="shadow-box" style="box-shadow:var(${n})"><span><b>${n.replace("--shadow-", "")}</b><br><code>${esc(v)}</code></span></div>`)
      .join("")}
  </div>
  <h3>Движение</h3>
  <p class="muted">Одна кривая на всю систему — <code>cubic-bezier(0.22, 1, 0.36, 1)</code>: появление страницы 420мс, подъём карточки на 4px за 360мс.
  Всплывающие панели раскрываются пружиной <code>--ease-spring-soft</code> (500мс, перелёт ~4%), закрываются за 220мс без перелёта. При <code>prefers-reduced-motion</code> — только прозрачность.</p>
  <div class="curve"></div>
</section>

<section id="components">
  <span class="label">05</span><h2>Компоненты</h2>
  <h3>Кнопки — 44px, пилюля</h3>
  <div class="demo-row"><span class="btn btn-primary">Записаться</span><span class="btn btn-secondary">Подробнее</span><span class="btn btn-ghost">Отмена</span></div>
  <h3>Поле — 48px, радиус 16px</h3>
  <div class="demo-row"><input class="field" placeholder="Имя клиента" /></div>
  <h3>Бейджи</h3>
  <div class="demo-row">
    <span class="badge" style="background:var(--color-panel);color:var(--color-ink-soft)">нейтральный</span>
    <span class="badge" style="background:var(--color-accent-soft);color:var(--color-accent-deep)">акцент</span>
    <span class="badge" style="background:var(--color-success-soft);color:var(--color-success)">подтверждена</span>
    <span class="badge" style="background:var(--color-warning-soft);color:var(--color-warning)">истекает</span>
    <span class="badge" style="background:var(--color-danger-soft);color:var(--color-danger);border:1px solid var(--color-danger-border)">неявка</span>
  </div>
  <h3>Карточка — радиус 28px, граница + свет</h3>
  <div style="max-width:420px;padding:24px;border:1px solid var(--color-line);border-radius:var(--radius-card);background:var(--ui-card-bg);box-shadow:var(--shadow-card)">
    <span class="label">Сегодня</span>
    <div style="font-size:20px;font-weight:600;margin:6px 0 4px">5 записей · 14 500 ₽</div>
    <div class="muted">Ближайшая — 12:30, маникюр с покрытием</div>
  </div>
</section>

<section id="themes">
  <span class="label">06</span><h2>Темы публичной страницы</h2>
  <p class="muted">Мастер выбирает одну из пяти тем в настройках; она перекрашивает страницу записи через <code>data-booking-theme</code>.
  У каждой темы есть светлая и тёмная пара — тёмная включается по настройке телефона клиента. Тёмные пары собраны не инверсией: акцент осветлён, текст на акценте становится тёмным.
  По умолчанию — «${esc(themes.find((t) => t.isDefault).label)}».</p>
  ${themes
    .map(
      (t) => `<div class="theme" id="theme-${t.id}">
    <div class="theme-head">
      <div><h3 style="margin:0">${esc(t.label)} <code>${t.id}</code>${t.isDefault ? ' <span class="badge" style="background:var(--color-accent-soft);color:var(--color-accent-deep)">по умолчанию</span>' : ""}</h3>
      <div class="muted" style="font-size:13px">${esc(t.description)}</div></div>
      <div class="theme-swatches">${t.swatches.map((c) => `<span style="background:${c}" title="${c}"></span>`).join("")}<span style="width:8px;border:0"></span>${t.darkSwatches.map((c) => `<span style="background:${c}" title="${c}"></span>`).join("")}</div>
    </div>
    <div class="theme-body">
      <div><div class="mock-cap">Светлая</div>${themeMock(t, "light")}</div>
      <div><div class="mock-cap">Тёмная</div>${themeMock(t, "dark")}</div>
      <div class="theme-ref">${t.reference ? `<div class="mock-cap">Палитра-референс</div><img src="референсы-тем/${t.id}.jpeg" alt="Референс палитры ${esc(t.label)}" />` : `<div class="mock-cap">Ключевые цвета</div>${["--color-background", "--color-ink", "--color-accent", "--ui-primary-bg"].map((n) => `<div style="font-size:12px;margin-bottom:6px"><span class="dot" style="background:${t.light[n]}"></span>${roles[n][0]} · ${t.light[n]}</div>`).join("")}`}</div>
    </div>
    <details><summary>Все токены темы (${Object.keys(t.light).length})</summary><div class="overflow">${themeTable(t)}</div></details>
  </div>`,
    )
    .join("\n")}
  <h3>Палитры-референсы, пока не ставшие темами</h3>
  <div class="unused">${unusedReferences.map((_, i) => `<img src="референсы-тем/не-использованы/${i + 1}.jpeg" alt="Палитра-референс ${i + 1}" />`).join("")}</div>
</section>
</main>
</body>
</html>
`;

// ---------- Запись ----------

mkdirSync(join(out, "tokens"), { recursive: true });
writeFileSync(join(out, "tokens/tokens.json"), `${JSON.stringify(tokens, null, 2)}\n`);
writeFileSync(join(out, "tokens/base.css"), baseCss);
writeFileSync(join(out, "tokens/public-themes.css"), themesCss);
writeFileSync(join(out, "index.html"), html);

console.log(`Брендбук собран: ${out}`);
console.log(`  базовых токенов: ${Object.keys(tokens.color.light).length}, тем: ${themes.length}`);
