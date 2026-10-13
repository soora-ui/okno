import type { MetadataRoute } from "next";
import { getCurrentLegalEdition, legalDocuments } from "@/config/legal";
import { siteUrl } from "@/config/site";
import { logError } from "@/lib/observability/logger";
import { getIndexablePublicProfilePaths } from "@/lib/seo/public-profile";

// Список мастеров меняется каждый день, поэтому карта собирается на запрос,
// а не при сборке: краулеры заходят редко, нагрузки это не даёт.
export const dynamic = "force-dynamic";

// Только индексируемые страницы: свои и публичные страницы мастеров.
// lastModified главной и тарифов не указываем: честной даты правки у них нет,
// а дата сборки на каждом деплое приучает поисковик не верить полю вовсе.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Если база недоступна, лучше отдать карту без мастеров, чем 500: на
  // ошибку поисковик реагирует хуже, чем на неполный список.
  const profilePaths = await getIndexablePublicProfilePaths().catch((error: unknown) => {
    logError("sitemap: не удалось получить страницы мастеров", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [] as string[];
  });

  return [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/legal`, changeFrequency: "yearly", priority: 0.2 },
    // Черновики и шаблон согласия клиента закрыты noindex — в карте им не место.
    ...legalDocuments
      .filter((document) => document.status === "published" && document.id !== "consent-client")
      .map((document) => ({
        url: `${siteUrl}${document.href}`,
        lastModified: getCurrentLegalEdition(document).effectiveFrom,
        changeFrequency: "yearly" as const,
        priority: 0.2,
      })),
    ...profilePaths.map((path) => ({
      url: `${siteUrl}${path}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
