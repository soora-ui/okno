"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Search, Star, X } from "lucide-react";
import { MasterAvatar } from "@/app/tg/master-avatar";
import { hapticSelect } from "@/app/tg/telegram";
import type { CatalogCity, CatalogMasterCard } from "@/app/tg/types";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; cities: CatalogCity[]; masters: CatalogMasterCard[] };

const debounceMs = 300;

type CatalogPayload = { cities: CatalogCity[]; masters: CatalogMasterCard[] };

// null — сервер не ответил или отказал: вкладка покажет «повторить».
async function fetchCatalog(
  initData: string,
  city: string,
  query: string,
): Promise<CatalogPayload | null> {
  try {
    const response = await fetch("/api/telegram/miniapp/masters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, city, query }),
    });
    const payload = (await response.json()) as ({ ok: true } & CatalogPayload) | { ok: false };

    return payload.ok ? { cities: payload.cities, masters: payload.masters } : null;
  } catch {
    return null;
  }
}

export function SearchTab({
  initData,
  preferredCity,
}: {
  initData: string;
  // Город последнего мастера: человек почти наверняка ищет там же.
  preferredCity: string | null;
}) {
  const [state, setState] = useState<SearchState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  // null — «ещё не выбирали»: первый ответ сервера решит, есть ли в каталоге
  // предпочтительный город. Пустая строка — осознанное «все города».
  const [city, setCity] = useState<string | null>(null);
  // Ответы приходят не в порядке запросов: быстрый ответ на «ман» не должен
  // затирать более поздний на «маникюр».
  const requestId = useRef(0);

  // Ответ сервера → состояние. Первая загрузка (nextCity === null): если в
  // предпочтительном городе есть мастера, сразу сужаемся до него.
  const apply = useCallback(
    (id: number, nextCity: string | null, payload: CatalogPayload | null) => {
      if (id !== requestId.current) {
        return;
      }

      if (!payload) {
        setState({ kind: "error" });
        return;
      }

      if (nextCity !== null) {
        setState({ kind: "ready", cities: payload.cities, masters: payload.masters });
        return;
      }

      const startCity =
        preferredCity && payload.cities.some((item) => item.name === preferredCity)
          ? preferredCity
          : "";

      setCity(startCity);
      setState({
        kind: "ready",
        cities: payload.cities,
        masters: startCity
          ? payload.masters.filter((master) => master.city === startCity)
          : payload.masters,
      });
    },
    [preferredCity],
  );

  const load = useCallback(
    (nextCity: string | null, nextQuery: string) => {
      const id = ++requestId.current;

      void fetchCatalog(initData, nextCity ?? "", nextQuery).then((payload) =>
        apply(id, nextCity, payload),
      );
    },
    [apply, initData],
  );

  // Первая загрузка каталога — синхронизация с сервером при появлении вкладки.
  // Повторный вызов в строгом режиме безвреден: оба запроса одинаковые, а
  // устаревший ответ отсекает requestId.
  useEffect(() => {
    const id = ++requestId.current;

    void fetchCatalog(initData, "", "").then((payload) => apply(id, null, payload));
  }, [apply, initData]);

  // Набор текста — с задержкой, чтобы не слать запрос на каждую букву.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(debounce.current ?? undefined), []);

  const changeQuery = (next: string) => {
    setQuery(next);
    clearTimeout(debounce.current ?? undefined);
    debounce.current = setTimeout(() => load(city ?? "", next), debounceMs);
  };

  const pickCity = (next: string) => {
    hapticSelect();
    setCity(next);
    clearTimeout(debounce.current ?? undefined);
    load(next, query);
  };

  const cities = state.kind === "ready" ? state.cities : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">Поиск мастера</h1>

      <label className="relative block">
        <span className="sr-only">Услуга, специализация или имя</span>
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="Маникюр, брови, имя мастера"
          maxLength={80}
          data-ui-input
          className="min-h-12 w-full rounded-full border border-line bg-surface pl-11 pr-11 text-sm text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => changeQuery("")}
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted"
          >
            <X size={16} />
          </button>
        ) : null}
      </label>

      {cities.length > 1 ? (
        <ul
          aria-label="Город"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[{ name: "", count: 0 }, ...cities].map((item) => {
            const active = (city ?? "") === item.name;

            return (
              <li key={item.name || "all"} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickCity(item.name)}
                  className={cn(
                    "min-h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-200",
                    active
                      ? "border-ink bg-ink text-ink-contrast"
                      : "border-line bg-surface text-ink-soft",
                  )}
                >
                  {item.name || "Все города"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {state.kind === "loading" ? <SearchSkeleton /> : null}

      {state.kind === "error" ? (
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <p className="text-sm leading-6 text-ink-soft">
            Не получилось загрузить мастеров. Проверь интернет и попробуй ещё раз.
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "loading" });
              load(city ?? "", query);
            }}
            className="mt-3 min-h-9 text-sm font-medium text-accent-deep"
          >
            Повторить
          </button>
        </div>
      ) : null}

      {state.kind === "ready" && state.masters.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <p className="font-semibold text-ink">Никого не нашли</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {query
              ? "Попробуй другое слово или убери город."
              : "В этом городе мастеров пока нет. Посмотри другие города."}
          </p>
        </div>
      ) : null}

      {state.kind === "ready" && state.masters.length > 0 ? (
        <ul className="space-y-3">
          {state.masters.map((master) => (
            <MasterCard key={master.profileId} master={master} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MasterCard({ master }: { master: CatalogMasterCard }) {
  const place = [master.city, master.address].filter(Boolean).join(", ");

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <a href={master.url} className="flex gap-3">
        <MasterAvatar name={master.name} url={master.avatarUrl} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold text-ink">{master.name}</p>
            {master.rating ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-xs font-medium text-ink">
                <Star size={11} className="fill-current" />
                {master.rating.average.toFixed(1).replace(".", ",")}
                <span className="text-muted">· {master.rating.count}</span>
              </span>
            ) : null}
          </div>
          {master.specialty ? (
            <p className="truncate text-sm text-ink-soft">{master.specialty}</p>
          ) : null}
          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{place}</span>
          </p>
        </div>
      </a>

      {master.topServices.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {master.topServices.map((title) => (
            <li
              key={title}
              className="max-w-full truncate rounded-tight bg-panel px-2.5 py-1 text-xs text-ink-soft"
            >
              {title}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-sm text-ink-soft">
          {master.priceFrom !== null ? (
            <>
              от{" "}
              <span className="font-semibold text-ink">
                {master.priceFrom.toLocaleString("ru-RU")} ₽
              </span>
            </>
          ) : (
            "Цена по запросу"
          )}
        </p>
        <ButtonLink
          href={`${master.url}/book`}
          className="min-h-9 px-4 py-2"
          documentNavigation
        >
          Записаться
        </ButtonLink>
      </div>
    </li>
  );
}

function SearchSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {[0, 1, 2].map((item) => (
        <li key={item} className="rounded-card border border-line bg-surface p-4">
          <div className="flex gap-3">
            <div className="size-14 shrink-0 animate-pulse rounded-full bg-panel" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-panel" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-panel" />
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-panel" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
