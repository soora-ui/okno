"use client";

import { knowledgeBaseScript } from "@/components/tour/knowledge-base-script";
import { TourPlayer } from "@/components/tour/tour-player";

/**
 * Плеер базы знаний внутри кабинета. Экраны — демо-кабинет на мок-данных:
 * сценарий нажимает вкладки и раскрывает разделы, а настройки мастера
 * остаются нетронутыми.
 */
export function KnowledgeBaseTour({ chapter }: { chapter: number }) {
  return (
    <TourPlayer
      script={knowledgeBaseScript}
      frameSrc={{
        settings: "/demo/cabinet/settings",
        schedule: "/demo/cabinet/schedule",
        client: "/demo/public-page?tour=off&consultant=1",
      }}
      variant="embedded"
      chapterNav="title"
      initialChapter={chapter}
      allChaptersHref="/knowledge"
      finale={{ label: "Перейти к настройкам", href: "/settings" }}
    />
  );
}
