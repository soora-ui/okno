"use client";

import dynamic from "next/dynamic";
import { MapPin, Navigation } from "lucide-react";
import { buildYandexRouteUrl, type MapLocation } from "@/lib/booking-page-settings";
import { Reveal } from "@/components/ui/reveal";

// Leaflet трогает window при импорте — только на клиенте. Сам он и тайлы
// грузятся, когда клиент долистал до карты (см. OsmMap).
const OsmMap = dynamic(() => import("@/components/maps/osm-map").then((mod) => mod.OsmMap), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full sm:h-[400px]" />,
});

export function PublicMapSection({
  location,
  city,
  address,
}: {
  location: MapLocation;
  city: string;
  address: string;
}) {
  const addressLine = [city, address].filter(Boolean).join(", ");

  return (
    <section id="location" className="relative mt-14 space-y-6">
      <Reveal variant="fade-up">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
              Как добраться
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Где проходит приём
            </h2>
            {addressLine ? (
              <p className="inline-flex items-center gap-2 text-base text-ink-soft">
                <MapPin size={17} className="shrink-0 text-accent-deep" />
                {addressLine}
              </p>
            ) : null}
          </div>
          <a
            href={buildYandexRouteUrl(location)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-medium text-ink transition hover:-translate-y-0.5"
            style={{ backgroundColor: "var(--ui-card-bg)" }}
          >
            <Navigation size={16} />
            Построить маршрут
          </a>
        </div>
      </Reveal>

      <div
        className="overflow-hidden rounded-section border shadow-card"
        style={{ borderColor: "var(--public-edge)", backgroundColor: "var(--ui-card-bg)" }}
      >
        <OsmMap location={location} className="h-[320px] w-full sm:h-[400px]" />
      </div>
    </section>
  );
}
