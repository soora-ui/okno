// Публичная страница мастера живёт на /{username} — в одном пространстве имён
// с разделами сайта. Username, совпадающий с разделом, либо уводил бы
// страницу мастера за вход (proxy считает /team защищённым), либо её
// перекрывал бы сам раздел. Поэтому такие имена занять нельзя.
//
// Список — все корневые сегменты src/app плюс несколько имён на вырост.
// Добавляя новый корневой раздел, допиши его сюда.
const RESERVED_USERNAMES = new Set([
  // Кабинет и админка
  "admin",
  "analytics",
  "archive",
  "brand-style",
  "clients",
  "dashboard",
  "feedback",
  "knowledge",
  "reviews",
  "schedule",
  "settings",
  "team",
  // Публичные и служебные разделы
  "api",
  "cancel",
  "demo",
  "legal",
  "login",
  "opengraph-image",
  "pricing",
  "register",
  "tg",
  // На вырост
  "about",
  "account",
  "auth",
  "blog",
  "help",
  "logout",
  "forgot-password",
  "reset-password",
  "signup",
  "support",
  "www",
]);

// Демо-аккаунты (scripts/seed-demo-analytics.mjs) — витрина и проверка
// аналитики на боевой базе. Их страницы закрыты от поиска, а префикс нельзя
// занять при регистрации: иначе настоящий мастер пропал бы из выдачи из-за имени.
const DEMO_USERNAME_PREFIX = "demo-";

export function isDemoUsername(username: string) {
  return username.trim().toLowerCase().startsWith(DEMO_USERNAME_PREFIX);
}

export function isReservedUsername(username: string) {
  return RESERVED_USERNAMES.has(username.trim().toLowerCase()) || isDemoUsername(username);
}

export const RESERVED_USERNAME_MESSAGE =
  "Этот username совпадает с разделом сайта — выбери другой.";
