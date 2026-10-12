import type { MetadataRoute } from "next";
import { getCurrentLegalEdition, legalDocuments } from "@/config/legal";
import { siteUrl } from "@/config/site";

// Только индексируемые страницы. Публичные страницы мастеров сюда пока не
// входят: решение, индексировать ли их, ещё не принято.
// lastModified главной и тарифов не указываем: честной даты правки у них нет,
// а дата сборки на каждом деплое приучает поисковик не верить полю вовсе.
export default function sitemap(): MetadataRoute.Sitemap {
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
  ];
}
