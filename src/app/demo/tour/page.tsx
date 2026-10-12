import type { Metadata } from "next";
import { DemoTour } from "@/components/tour/demo-tour";
import {
  landingDemoBookHref,
  landingDemoBookingSlotsByService,
  landingDemoServices,
} from "@/lib/landing-demo";

// Служебная страница: в выдаче не нужна.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

// Тур «как ролик» по главам: настоящие демо-страницы в рамке телефона или
// ноутбука, поверх них камера, подсветка и палец. Сам по себе ничего не
// рендерит из профиля — всё берётся из тех же маршрутов, что видит клиент,
// а кабинет — из демо-кабинета на мок-данных (src/lib/demo-cabinet.ts).
export default function DemoTourPage() {
  const service = landingDemoServices[0];
  const slot = landingDemoBookingSlotsByService[service.id]?.[0];
  const firstTime = slot?.times[0] ?? "";
  const pickedTime = slot?.times[1] ?? firstTime;

  const bookQuery = new URLSearchParams({
    step: "1",
    service: service.id,
    date: slot?.value ?? "",
    time: firstTime,
  });
  const contactsQuery = new URLSearchParams({
    step: "2",
    service: service.id,
    date: slot?.value ?? "",
    time: pickedTime,
    view: "tour",
  });
  const confirmQuery = new URLSearchParams({
    service: service.title,
    date: slot?.date ?? "",
    time: pickedTime,
    name: "Марина",
    view: "tour",
  });

  return (
    <DemoTour
      frameSrc={{
        profile: "/demo/public-page?tour=off",
        book: `${landingDemoBookHref}?${bookQuery}`,
        contacts: `${landingDemoBookHref}?${contactsQuery}`,
        confirm: `/demo/public-page/confirm?${confirmQuery}`,
        dashboard: "/demo/cabinet/dashboard",
        schedule: "/demo/cabinet/schedule",
        clients: "/demo/cabinet/clients",
        settings: "/demo/cabinet/settings",
      }}
      cleanHref="/demo/public-page?tour=off"
      registerHref="/register"
    />
  );
}
