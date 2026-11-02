// Сервис-воркер приложения okno (PWA). Задача узкая: приложение с экрана
// «Домой» должно открываться быстро и не показывать белый экран браузера,
// когда нет сети. Страницы и API не кэшируем — в них расписание и данные
// клиентов, устаревшая копия хуже честного «нет связи».
//
// Меняете список PRECACHE или логику — поднимите версию: старый кэш удалится
// при активации новой.
const VERSION = "v1";
const STATIC_CACHE = `okno-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("okno-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Файлы из /_next/static/ и /icons/ неизменяемые (в имени хэш или они
// версионируются вместе с воркером), их можно отдавать из кэша сразу.
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((response) => response ?? Response.error()),
      ),
    );
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ??
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
  }
});
