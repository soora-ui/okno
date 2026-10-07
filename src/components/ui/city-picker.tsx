"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  defaultCityLabel,
  findCity,
  searchCities,
  type City,
  type CityCatalog,
} from "@/lib/city-catalog";
import { cn } from "@/lib/utils";

// Справочник один на страницу: грузим при первом поле и дальше переиспользуем.
let catalogPromise: Promise<CityCatalog> | null = null;

function loadCatalog() {
  catalogPromise ??= import("@/lib/city-catalog.json").then(
    (module) => module.default as CityCatalog,
  );
  return catalogPromise;
}

type CityPickerProps = {
  label: string;
  name: string;
  hint?: string;
  // id из справочника или название, как оно лежит в профиле.
  defaultValue?: string | null;
  // Помогает различить тёзок: «Октябрьский» в Башкирии и в Подмосковье.
  timezone?: string | null;
};

export function CityPicker({ label, name, hint, defaultValue, timezone }: CityPickerProps) {
  const initial = defaultValue?.trim() || defaultCityLabel;
  const [catalog, setCatalog] = useState<CityCatalog | null>(null);
  const [selected, setSelected] = useState<City | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then((loaded) => {
      if (cancelled) return;
      setCatalog(loaded);
      setSelected(
        (current) =>
          current ??
          findCity(loaded, initial, timezone) ??
          findCity(loaded, defaultCityLabel),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [initial, timezone]);

  const results = useMemo(
    () => (catalog && open ? searchCities(catalog, query) : []),
    [catalog, open, query],
  );

  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Пока справочник грузится, отправится то, что пришло с сервера: сервер
  // понимает и id, и название.
  const submitValue = selected?.value ?? initial;
  const shownLabel = selected?.label ?? (/^\d+$/.test(initial) ? "" : initial);

  function choose(city: City) {
    setSelected(city);
    setOpen(false);
    setQuery("");
  }

  // Открытое поле пустое, а текущий город виден подсказкой: печатать можно
  // сразу, не стирая. Ушёл без выбора — город остаётся прежним.
  function openList() {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openList();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      // Enter выбирает город, а не отправляет форму.
      event.preventDefault();
      const city = results[activeIndex];
      if (city) choose(city);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label htmlFor={`${listId}-input`} className="font-medium" style={{ color: "var(--color-ink)" }}>
        {label}
      </label>
      <input type="hidden" name={name} value={submitValue} />
      <div className="relative">
        <input
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            !catalog ? "Загружаем города…" : open && shownLabel ? shownLabel : "Начни вводить название"
          }
          value={open ? query : shownLabel}
          onFocus={openList}
          onClick={() => {
            if (!open) openList();
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--ui-field-bg)",
            color: "var(--color-ink)",
          }}
          className="min-h-12 w-full rounded-field border pl-4 pr-10 text-sm outline-none transition"
          data-ui-input
        />
        <ChevronDown
          size={16}
          aria-hidden
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
          style={{ color: "var(--color-muted)" }}
        />

        {open ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-field border p-1"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-surface)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            {!catalog ? (
              <li className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>
                Загружаем города…
              </li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>
                Ничего не нашли — проверь написание.
              </li>
            ) : (
              results.map((city, index) => {
                const isSelected = city.value === selected?.value;
                return (
                  <li
                    key={city.value}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    // mousedown, а не click: иначе blur поля закроет список раньше.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(city);
                    }}
                    onMouseMove={() => setActiveIndex(index)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2",
                      index === activeIndex && "bg-panel",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ color: "var(--color-ink)" }}>
                        {city.label}
                      </span>
                      {city.region ? (
                        <span className="block truncate text-xs" style={{ color: "var(--color-muted)" }}>
                          {city.region}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <Check size={16} aria-hidden style={{ color: "var(--color-accent-deep)" }} />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
      {hint ? (
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
