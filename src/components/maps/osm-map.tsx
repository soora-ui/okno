"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import type { MapLocation } from "@/lib/booking-page-settings";
import { cn } from "@/lib/utils";

// Карта на OpenStreetMap через Leaflet: бесплатно, без ключа и без рекламы.
// Тайлы — с серверов OSM, их правила требуют подпись © OpenStreetMap, поэтому
// attribution на карте оставляем.
const tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const attribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

const minZoom = 3;
const maxZoom = 19;

function clampZoom(zoom: number) {
  return Math.min(Math.max(Math.round(zoom), minZoom), maxZoom);
}

function roundCoord(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

// Метка своя, а не стандартная картинка Leaflet: та при сборке теряет путь
// к png, да и цвет акцента страницы у неё не возьмёшь.
const pinHtml = `<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true" style="display:block;filter:drop-shadow(0 4px 6px rgba(0,0,0,.3))"><path d="M17 1C8.2 1 1 8 1 16.8 1 28.5 17 43 17 43s16-14.5 16-26.2C33 8 25.8 1 17 1Z" fill="var(--color-accent-deep, #c2595f)" stroke="#fff" stroke-width="2"/><circle cx="17" cy="17" r="6" fill="#fff"/></svg>`;

export type OsmMapProps = {
  /** Где стоит метка. null — метки нет. */
  location: MapLocation | null;
  /** Центр, когда метки нет (например, город мастера). */
  fallbackCenter?: { lat: number; lon: number; zoom: number };
  /** Режим выбора точки: клик ставит метку, метку можно тащить. */
  onPick?: (location: MapLocation) => void;
  /**
   * Меняется — карта перелетает к location. Нужен поиску по адресу: обычное
   * перемещение метки кликом не должно дёргать карту.
   */
  flyKey?: number;
  className?: string;
};

export function OsmMap({ location, fallbackCenter, onPick, flyKey, className }: OsmMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const placeMarkerRef = useRef<((lat: number, lon: number) => void) | null>(null);
  const onPickRef = useRef(onPick);
  const locationRef = useRef(location);

  useEffect(() => {
    onPickRef.current = onPick;
    locationRef.current = location;
  });

  // Карту создаём, только когда контейнер подъехал к экрану: на публичной
  // странице она в самом низу, и грузить Leaflet с тайлами сразу незачем.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const editable = Boolean(onPickRef.current);

    function placeMarker(L: typeof import("leaflet"), map: LeafletMap, lat: number, lon: number) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lon]);
        return;
      }
      const marker = L.marker([lat, lon], {
        draggable: editable,
        keyboard: false,
        icon: L.divIcon({
          html: pinHtml,
          className: "",
          iconSize: [34, 44],
          iconAnchor: [17, 43],
        }),
      }).addTo(map);
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        onPickRef.current?.({
          lat: roundCoord(point.lat),
          lon: roundCoord(point.lng),
          zoom: clampZoom(map.getZoom()),
        });
      });
      markerRef.current = marker;
    }

    async function init() {
      const L = await import("leaflet");
      if (cancelled || !container) return;

      const start = locationRef.current ?? fallbackCenter ?? { lat: 55.751244, lon: 37.618423, zoom: 10 };
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      const map = L.map(container, {
        center: [start.lat, start.lon],
        zoom: start.zoom,
        minZoom,
        maxZoom,
        // Колесо мыши на публичной странице не должно перехватывать прокрутку
        // страницы, а на телефоне карту двигают двумя пальцами — одним листают.
        scrollWheelZoom: editable,
        dragging: editable || !isTouch,
        attributionControl: false,
      });
      L.control.attribution({ prefix: false }).addAttribution(attribution).addTo(map);
      L.tileLayer(tileUrl, { maxZoom, className: "osm-tiles" }).addTo(map);
      mapRef.current = map;
      placeMarkerRef.current = (lat, lon) => placeMarker(L, map, lat, lon);

      if (locationRef.current) {
        placeMarker(L, map, locationRef.current.lat, locationRef.current.lon);
      }

      if (editable) {
        map.on("click", (event) => {
          const { lat, lng } = event.latlng;
          placeMarker(L, map, lat, lng);
          onPickRef.current?.({
            lat: roundCoord(lat),
            lon: roundCoord(lng),
            zoom: clampZoom(map.getZoom()),
          });
        });
        map.on("zoomend", () => {
          const current = locationRef.current;
          if (current) onPickRef.current?.({ ...current, zoom: clampZoom(map.getZoom()) });
        });
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void init();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      placeMarkerRef.current = null;
    };
    // Карта создаётся один раз; дальше её ведут эффекты ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Метку сняли (мастер убрал карту) — убираем и с карты.
  useEffect(() => {
    if (!location && markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [location]);

  useEffect(() => {
    const map = mapRef.current;
    if (!flyKey || !map || !location) return;
    placeMarkerRef.current?.(location.lat, location.lon);
    map.flyTo([location.lat, location.lon], location.zoom, { duration: 0.6 });
    // Перелёт — только по смене flyKey, а не при каждом сдвиге метки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);

  return (
    <div
      ref={containerRef}
      className={cn("osm-map relative z-0 overflow-hidden", className)}
    />
  );
}
