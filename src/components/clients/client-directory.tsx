"use client";

import { Search, Star } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { ClientReturnReminder } from "@/components/clients/client-return-reminder";
import { ClientNotesForm } from "@/components/forms/booking-operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReliabilityBadge } from "@/lib/client-reliability";

export type ClientDirectoryHistoryItem = {
  id: string;
  serviceTitle: string;
  startsAtLabel: string;
  statusLabel: string;
  statusTone: "neutral" | "success" | "accent" | "warning" | "danger";
  note: string;
};

export type ClientDirectoryReview = {
  id: string;
  rating: number;
  comment: string;
  serviceTitle: string;
  dateLabel: string;
};

export type ClientDirectoryItem = {
  id: string;
  name: string;
  phoneMasked: string;
  notes: string;
  lastVisitLabel: string;
  nextVisitLabel: string | null;
  returnFrequencyLabel: string;
  totalVisitsLabel: string;
  preferredServices: Array<{
    title: string;
    visitsLabel: string;
  }>;
  history: ClientDirectoryHistoryItem[];
  reviews: ClientDirectoryReview[];
  searchText: string;
  reliability: ReliabilityBadge;
  // «Давно не был»: срок повтора услуги прошёл, будущей записи нет.
  returnStatus: {
    due: boolean;
    sinceLabel: string | null;
  };
  // Можно ли напомнить о себе через бота и когда напоминали в последний раз.
  telegram: {
    reachable: boolean;
    lastRemindedLabel: string | null;
  };
};

function ReturnDueBadge({ client }: { client: ClientDirectoryItem }) {
  if (!client.returnStatus.due) {
    return null;
  }

  return (
    <Badge tone="warning">
      Давно не был{client.returnStatus.sinceLabel ? ` · ${client.returnStatus.sinceLabel}` : ""}
    </Badge>
  );
}

const reliabilityBadgeTone: Record<NonNullable<ReliabilityBadge["tone"]>, "success" | "warning" | "danger"> = {
  success: "success",
  warning: "warning",
  danger: "danger",
};

function ReliabilityBadgeChip({ reliability }: { reliability: ReliabilityBadge }) {
  return (
    <span title={reliability.detailLabel}>
      <Badge tone={reliability.tone ? reliabilityBadgeTone[reliability.tone] : "neutral"}>
        {reliability.label}
      </Badge>
    </span>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-panel border border-line bg-panel/55 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-ink">{value}</p>
    </div>
  );
}

function ClientDetailsModal({
  client,
  onClose,
  showReliability = false,
}: {
  client: ClientDirectoryItem | null;
  onClose: () => void;
  showReliability?: boolean;
}) {
  useEffect(() => {
    if (!client) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [client, onClose]);

  if (!client) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,26,23,0.26)] px-3 py-6 sm:px-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Карточка клиента ${client.name}`}
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-section border border-line bg-surface shadow-ink"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-ink sm:text-3xl">{client.name}</h2>
              <Badge tone="accent">{client.totalVisitsLabel}</Badge>
              <ReturnDueBadge client={client} />
              {showReliability ? (
                <ReliabilityBadgeChip reliability={client.reliability} />
              ) : null}
            </div>
            <p className="text-sm text-ink-soft">{client.phoneMasked}</p>
            {showReliability ? (
              <p className="text-xs text-muted">{client.reliability.detailLabel}</p>
            ) : null}
          </div>
          <Button variant="secondary" onClick={onClose} className="px-4">
            Закрыть
          </Button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard label="Последний визит" value={client.lastVisitLabel} />
            <StatCard label="Частота возврата" value={client.returnFrequencyLabel} />
            <StatCard
              label="Следующий визит"
              value={client.nextVisitLabel ?? "Пока не записан"}
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <section className="rounded-nested border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-ink">История визитов</h3>
                <span className="text-xs uppercase tracking-[0.16em] text-muted">
                  Последние {client.history.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {client.history.length > 0 ? (
                  client.history.map((visit) => (
                    <div
                      key={visit.id}
                      className="rounded-panel border border-line bg-surface px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-ink">{visit.serviceTitle}</p>
                          <p className="mt-1 text-sm text-ink-soft">{visit.startsAtLabel}</p>
                        </div>
                        <Badge tone={visit.statusTone}>{visit.statusLabel}</Badge>
                      </div>
                      {visit.note ? (
                        <p className="mt-3 text-sm leading-6 text-muted">{visit.note}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-panel border border-dashed border-line bg-surface px-4 py-4 text-sm leading-6 text-muted">
                    Здесь появятся прошедшие и будущие визиты, как только у клиента
                    накопится история записей.
                  </div>
                )}
              </div>

              {/* Отзывы этого клиента — те же данные, что в ленте /reviews,
                  просто рядом с его историей: там смотрят «что обо мне пишут»,
                  здесь «что писал именно он». */}
              {client.reviews.length > 0 ? (
                <div className="mt-5 border-t border-line pt-4">
                  <h3 className="text-base font-semibold text-ink">Отзывы клиента</h3>
                  <div className="mt-3 space-y-3">
                    {client.reviews.map((review) => (
                      <div
                        key={review.id}
                        className="rounded-panel border border-line bg-surface px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-medium text-ink">{review.serviceTitle}</p>
                          <span className="inline-flex items-center gap-1 text-sm text-ink">
                            <Star
                              size={14}
                              style={{ color: "var(--color-warning)" }}
                              fill="currentColor"
                            />
                            {review.rating}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted">{review.dateLabel}</p>
                        {review.comment ? (
                          <p className="mt-2 text-sm leading-6 text-ink-soft">
                            {review.comment}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-nested border border-line bg-panel p-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-ink">Предпочитаемые услуги</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {client.preferredServices.length > 0 ? (
                      client.preferredServices.map((service) => (
                        <Badge key={`${client.id}-${service.title}`} tone="warning">
                          {service.title} · {service.visitsLabel}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-muted">
                        После пары визитов здесь станет видно, что клиент выбирает чаще.
                      </p>
                    )}
                  </div>
                </div>
                <ClientNotesForm clientId={client.id} notes={client.notes} />

                <div className="border-t border-line pt-4">
                  <h3 className="text-base font-semibold text-ink">Напомнить о себе</h3>
                  <div className="mt-3">
                    <ClientReturnReminder
                      key={client.id}
                      clientId={client.id}
                      clientName={client.name}
                      reachable={client.telegram.reachable}
                      lastRemindedLabel={client.telegram.lastRemindedLabel}
                      due={client.returnStatus.due}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClientDirectory({
  items,
  showReliability = false,
}: {
  items: ClientDirectoryItem[];
  // Рейтинг надёжности входит в «Соло. Расширенный» и «Студия и барбершоп».
  showReliability?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const dueCount = items.filter((item) => item.returnStatus.due).length;

  const filteredItems = items.filter(
    (item) =>
      (!normalizedQuery || item.searchText.includes(normalizedQuery)) &&
      (!onlyDue || item.returnStatus.due),
  );
  const selectedClient = filteredItems.find((item) => item.id === selectedClientId)
    ?? items.find((item) => item.id === selectedClientId)
    ?? null;

  return (
    <>
      <div className="space-y-5">
      <div className="space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-[42px] text-muted">
            <Search size={18} />
          </span>
          <Input
            label="Быстрый поиск"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Имя, телефон, заметка или любимая услуга"
            className="pl-11"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {filteredItems.length === items.length
              ? `Всего клиентов: ${items.length}.`
              : `Найдено ${filteredItems.length} из ${items.length}.`}
          </p>
          {dueCount > 0 ? (
            <button
              type="button"
              onClick={() => setOnlyDue((value) => !value)}
              aria-pressed={onlyDue}
              className={`touch-manipulation rounded-full border px-4 py-2 text-sm transition active:scale-[0.98] ${
                onlyDue
                  ? "border-ink bg-ink text-surface"
                  : "border-line text-ink hover:-translate-y-0.5"
              }`}
            >
              Давно не были · {dueCount}
            </button>
          ) : null}
        </div>
      </div>

      {filteredItems.length > 0 ? (
        <div className="grid gap-5">
          {filteredItems.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => setSelectedClientId(client.id)}
              className="w-full rounded-card border border-line bg-surface p-5 text-left shadow-subtle transition duration-300 hover:-translate-y-0.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold text-ink">{client.name}</h2>
                    <Badge tone="accent">{client.totalVisitsLabel}</Badge>
                    <ReturnDueBadge client={client} />
                    {showReliability ? (
                      <ReliabilityBadgeChip reliability={client.reliability} />
                    ) : null}
                  </div>
                  <p className="text-sm text-ink-soft">{client.phoneMasked}</p>
                </div>
                {client.nextVisitLabel ? (
                  <Badge tone="success">Следующий визит: {client.nextVisitLabel}</Badge>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <StatCard label="Последний визит" value={client.lastVisitLabel} />
                <StatCard label="Частота возврата" value={client.returnFrequencyLabel} />
                <StatCard
                  label="Предпочитает"
                  value={
                    client.preferredServices.length > 0
                      ? client.preferredServices.map((service) => service.title).join(", ")
                      : "Пока данных мало"
                  }
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm leading-6 text-muted">
                  {client.history.length > 0
                    ? "Открыть карточку: история, заметки и любимые услуги."
                    : "Открыть карточку клиента и добавить первые заметки."}
                </p>
                <span className="text-sm font-medium text-ink">Открыть карточку</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-nested border border-dashed border-line p-5 text-sm leading-6 text-muted">
          По текущему запросу пока ничего не найдено. Попробуй имя, телефон, заметку
          или услугу, на которую клиент записывается чаще всего.
        </div>
      )}
      </div>
      <ClientDetailsModal
        client={selectedClient}
        onClose={() => setSelectedClientId(null)}
        showReliability={showReliability}
      />
    </>
  );
}
