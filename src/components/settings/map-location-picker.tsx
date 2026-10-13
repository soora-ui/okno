"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, Trash2 } from "lucide-react";
import { updateMapLocationAction } from "@/app/actions/settings";
import { defaultMapZoom, type MapLocation } from "@/lib/booking-page-settings";
import { FormMessage } from "@/components/forms/auth-form-state";
import { OsmMap } from "@/components/maps/osm-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchResult = { label: string; lat: number; lon: number };

// Геокодер Nominatim (OpenStreetMap): бесплатный, без ключа, но не больше
// запроса в секунду и без автодополнения по мере ввода — поэтому ищем только
// по кнопке или Enter.
async function geocode(query: string, limit: number): Promise<SearchResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("accept-language", "ru");
  url.searchParams.set("q", query);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const rows = (await response.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((row) => ({
    label: row.display_name,
    lat: Number(row.lat),
    lon: Number(row.lon),
  }));
}

export function MapLocationPicker({
  initialLocation,
  city,
  address,
}: {
  initialLocation: MapLocation | null;
  city: string;
  address: string;
}) {
  const [location, setLocation] = useState<MapLocation | null>(initialLocation);
  const [savedLocation, setSavedLocation] = useState<MapLocation | null>(initialLocation);
  const [fallbackCenter, setFallbackCenter] = useState<
    { lat: number; lon: number; zoom: number } | null | undefined
  >(initialLocation ? null : undefined);
  const [query, setQuery] = useState([city, address].filter(Boolean).join(", "));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [flyKey, setFlyKey] = useState(0);
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Точки ещё нет — открываем карту на городе мастера, а не на всей стране.
  useEffect(() => {
    if (initialLocation) return;
    let cancelled = false;
    geocode(city || "Москва", 1)
      .then(([found]) => {
        if (!cancelled) setFallbackCenter(found ? { lat: found.lat, lon: found.lon, zoom: 12 } : null);
      })
      .catch(() => {
        if (!cancelled) setFallbackCenter(null);
      });
    return () => {
      cancelled = true;
    };
  }, [initialLocation, city]);

  async function search() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearchState("loading");
    try {
      const found = await geocode(trimmed, 5);
      setResults(found);
      setSearchState(found.length > 0 ? "idle" : "empty");
      if (found.length === 1) pickResult(found[0]);
    } catch {
      setResults([]);
      setSearchState("error");
    }
  }

  function pickResult(result: SearchResult) {
    setLocation({ lat: result.lat, lon: result.lon, zoom: defaultMapZoom });
    setFlyKey((key) => key + 1);
    setResults([]);
  }

  function save(next: MapLocation | null) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateMapLocationAction(next);
      setMessage({ text: result.message, success: result.success });
      if (result.success) {
        setSavedLocation(next);
        if (!next) setLocation(null);
      }
    });
  }

  const isDirty =
    location?.lat !== savedLocation?.lat ||
    location?.lon !== savedLocation?.lon ||
    location?.zoom !== savedLocation?.zoom;

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="flex-1">
          <Input
            label="Найти адрес"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Симферополь, ул. Пушкина, 12"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={!query.trim() || searchState === "loading"}
          className="gap-2"
        >
          <Search size={16} />
          {searchState === "loading" ? "Ищу..." : "Найти"}
        </Button>
      </form>

      {results.length > 1 ? (
        <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-nested border border-line">
          {results.map((result) => (
            <li key={`${result.lat},${result.lon}`}>
              <button
                type="button"
                onClick={() => pickResult(result)}
                className="w-full px-4 py-3 text-left text-sm text-ink-soft transition hover:bg-panel hover:text-ink"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchState === "empty" ? (
        <FormMessage message="Такой адрес не нашёлся. Попробуй короче — город, улица и дом, — или просто кликни по карте." />
      ) : null}
      {searchState === "error" ? (
        <FormMessage message="Поиск сейчас не отвечает. Найди место на карте вручную и кликни по нему." />
      ) : null}

      {/* Ждём центр города, иначе карта сначала откроется на Москве и прыгнет. */}
      {fallbackCenter === undefined ? (
        <div className="h-[360px] animate-pulse rounded-nested border border-line bg-panel" />
      ) : (
        <OsmMap
          location={location}
          fallbackCenter={fallbackCenter ?? undefined}
          onPick={setLocation}
          flyKey={flyKey}
          className="h-[360px] w-full rounded-nested border border-line"
        />
      )}
      <p className="text-xs text-muted">
        Кликни по карте в нужное место — появится метка, её можно перетащить.
      </p>

      {message ? <FormMessage message={message.text} success={message.success} /> : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => save(location)}
          disabled={!location || !isDirty || isPending}
        >
          {isPending ? "Сохраняю..." : "Сохранить точку"}
        </Button>
        {savedLocation ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => save(null)}
            disabled={isPending}
            className="gap-2"
          >
            <Trash2 size={16} />
            Убрать карту со страницы
          </Button>
        ) : null}
      </div>
    </div>
  );
}
