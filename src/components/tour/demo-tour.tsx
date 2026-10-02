"use client";

import { demoTourScript } from "@/components/tour/demo-tour-script";
import { TourPlayer } from "@/components/tour/tour-player";

/** Демо-тур для лендинга: сценарий живёт на клиенте, страница отдаёт адреса экранов. */
export function DemoTour({
  frameSrc,
  cleanHref,
  registerHref,
}: {
  frameSrc: Record<string, string>;
  cleanHref: string;
  registerHref: string;
}) {
  return (
    <TourPlayer
      script={demoTourScript}
      frameSrc={frameSrc}
      finale={{ label: "Создать свою страницу", href: registerHref }}
      skip={{ label: "Открыть профиль без тура", href: cleanHref }}
    />
  );
}
