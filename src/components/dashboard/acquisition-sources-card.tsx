"use client";

import { useState } from "react";
import { Check, Copy, Route } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  acquisitionSourceLabels,
  taggableAcquisitionSources,
  withAcquisitionSource,
  type AcquisitionSource,
  type AcquisitionSourceStat,
} from "@/lib/acquisition-sources";

// Источники записей (документы/источники-записей.md): ссылка с меткой для
// каждого канала и сколько онлайн-записей он дал за 30 дней.
export function AcquisitionSourcesCard({
  bookingUrl,
  stats,
  statsDays,
}: {
  bookingUrl: string;
  // null — цифры сейчас недоступны, показываем только ссылки.
  stats: AcquisitionSourceStat[] | null;
  statsDays: number;
}) {
  const [copiedSource, setCopiedSource] = useState<AcquisitionSource | null>(null);
  const counts = new Map(stats?.map((stat) => [stat.source, stat.count]) ?? []);
  const total = stats?.reduce((sum, stat) => sum + stat.count, 0) ?? 0;
  // Каналы с записями — выше: мастер сразу видит, что работает.
  const channels = [...taggableAcquisitionSources].sort(
    (left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0),
  );
  const untaggedRows = (stats ?? []).filter(
    (stat) => stat.source === null || stat.source === "search",
  );

  async function handleCopy(source: AcquisitionSource) {
    try {
      await navigator.clipboard.writeText(withAcquisitionSource(bookingUrl, source));
      setCopiedSource(source);
      setTimeout(() => setCopiedSource(null), 2000);
    } catch {
      // Буфер обмена недоступен — ссылка видна в подсказке, её можно набрать.
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <Route size={18} className="mt-1.5 shrink-0 text-accent-deep" />
        <div>
          <h2 className="text-2xl font-semibold text-ink">Откуда клиенты</h2>
          <p className="text-sm text-muted">
            Поставь в каждую соцсеть свою ссылку — и здесь будет видно, какая приводит
            записи.
          </p>
        </div>
      </div>

      <ul className="overflow-hidden rounded-panel border border-line">
        {channels.map((source) => (
          <li key={source} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {acquisitionSourceLabels[source]}
            </span>
            {stats ? (
              <span className="text-sm tabular-nums text-ink-soft">
                {counts.get(source) ?? 0}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => handleCopy(source)}
              aria-label={`Скопировать ссылку для ${acquisitionSourceLabels[source]}`}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink-soft"
            >
              {copiedSource === source ? (
                <Check size={14} className="text-success" />
              ) : (
                <Copy size={14} />
              )}
              {copiedSource === source ? "Готово" : "Ссылка"}
            </button>
          </li>
        ))}
        {untaggedRows.map((stat) => (
          <li key={stat.source ?? "unknown"} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{stat.label}</span>
            <span className="text-sm tabular-nums text-ink-soft">{stat.count}</span>
            {/* Под кнопку — пустое место той же ширины, чтобы цифры стояли в столбик. */}
            <span className="w-[5.25rem] shrink-0" />
          </li>
        ))}
      </ul>

      <p className="text-xs leading-5 text-muted">
        {stats === null
          ? "Цифры появятся чуть позже — ссылки уже можно ставить."
          : total > 0
            ? `Онлайн-записи за ${statsDays} дней. «Не определён» — заход без метки: по прямой ссылке, из закладок или по QR.`
            : `За ${statsDays} дней онлайн-записей пока не было. Ссылка — это адрес твоей страницы с меткой канала, клиенту она выглядит обычно.`}
      </p>
    </Card>
  );
}
