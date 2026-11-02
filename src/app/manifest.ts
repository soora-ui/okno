import type { MetadataRoute } from "next";
import { siteName } from "@/config/site";

// Манифест превращает сайт в устанавливаемое приложение: иконка на экране
// «Домой», запуск без панелей браузера, ярлыки по долгому нажатию на иконку.
// Ставит его мастер, поэтому стартуем в кабинете — без входа proxy.ts сам
// уведёт на /login и вернёт обратно.
//
// Кольцо логотипа занимает 70% иконки, то есть целиком лежит в безопасной
// зоне maskable (80%) — отдельная версия с полями не нужна.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${siteName} — кабинет мастера`,
    short_name: siteName,
    description: "Записи, расписание и клиенты под рукой.",
    lang: "ru",
    dir: "ltr",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Цвета светлой темы из globals.css. Тёмную тему окно запуска и
    // статус-бар берут из theme-color с media в layout.tsx.
    background_color: "#faf7f1",
    theme_color: "#faf7f1",
    categories: ["business", "productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      {
        src: "/icons/icon-monochrome.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "monochrome",
      },
    ],
    shortcuts: [
      {
        name: "Расписание",
        url: "/schedule?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Клиенты",
        url: "/clients?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Настройки",
        url: "/settings?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
