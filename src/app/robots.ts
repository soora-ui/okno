import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";

// Кабинет, админка и API — приватные и за логином: краулеру там нечего
// делать. Служебные публичные страницы (вход, запись, отмена, демо) не
// закрываем здесь, а помечаем noindex в metadata — иначе бот не увидит
// этот noindex, а URL по внешней ссылке может попасть в индекс без текста.
// AI-краулеры открыты сознательно: упоминание okno в ответах ChatGPT,
// Perplexity и Алисы — канал привлечения.
//
// Правило robots — префикс: «/team» закрыл бы и мастера с ником team-anna.
// Поэтому каждый раздел закрываем точно: сам адрес ($) и всё под ним (/).
const privateSections = [
  "/api",
  "/admin",
  "/dashboard",
  "/schedule",
  "/clients",
  "/settings",
  "/team",
  "/archive",
  "/knowledge",
  "/reviews",
  "/demo/cabinet",
];

const privatePaths = privateSections.flatMap((path) => [`${path}$`, `${path}/`]);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: privatePaths },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
