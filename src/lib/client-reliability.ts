import { DateTime } from "luxon";

// Рейтинг надёжности клиента (Модуль 1 из okno-tz-rating-prepayment.md).
// Приватный per master: считается только по bookings.profile_id текущего
// мастера — см. client_reliability view (202607090001_client_reliability.sql).

export type VisitStatus =
  | "pending"
  | "completed"
  | "no_show"
  | "cancelled_late"
  | "cancelled_ok";

export const visitStatusLabels: Record<VisitStatus, string> = {
  pending: "Без отметки",
  completed: "Пришёл",
  no_show: "Не пришёл",
  cancelled_late: "Отменил поздно",
  cancelled_ok: "Отменил заранее",
};

// Минимальная выборка для показа жёсткого бейджа — см. ТЗ 1.2. Один
// форс-мажор не должен вешать ярлык на нового клиента.
const MIN_SAMPLE_FOR_BADGE = 3;

export type ReliabilityAggregate = {
  totalFinished: number;
  completed: number;
  noShows: number;
  lateCancels: number;
  okCancels: number;
  reliabilityScore: number;
};

export type ReliabilityBadgeTone = "success" | "warning" | "danger";

export type ReliabilityBadge = {
  hasEnoughData: boolean;
  tone: ReliabilityBadgeTone | null;
  label: string;
  detailLabel: string;
};

function pluralizeVisits(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} визит`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} визита`;
  return `${count} визитов`;
}

// Считает агрегаты рейтинга из сырых bookings (без чтения view) — используется
// там, где данные уже загружены вместе с остальным дашбордом мастера и делать
// отдельный поход в client_reliability накладно.
export function computeReliabilityAggregate(
  visitStatuses: VisitStatus[],
): ReliabilityAggregate {
  const finished = visitStatuses.filter((status) => status !== "pending");
  const completed = finished.filter((status) => status === "completed").length;
  const noShows = finished.filter((status) => status === "no_show").length;
  const lateCancels = finished.filter((status) => status === "cancelled_late").length;
  const okCancels = finished.filter((status) => status === "cancelled_ok").length;

  const scoreDenominator = completed + noShows + lateCancels;
  const reliabilityScore =
    scoreDenominator > 0 ? Math.round((100 * completed) / scoreDenominator) : 0;

  return {
    totalFinished: finished.length,
    completed,
    noShows,
    lateCancels,
    okCancels,
    reliabilityScore,
  };
}

// Правило отображения бейджа — ТЗ 1.2: недостаточно данных / зелёный / жёлтый / красный.
export function buildReliabilityBadge(aggregate: ReliabilityAggregate): ReliabilityBadge {
  if (aggregate.totalFinished < MIN_SAMPLE_FOR_BADGE) {
    return {
      hasEnoughData: false,
      tone: null,
      label: "Недостаточно данных",
      detailLabel:
        aggregate.totalFinished > 0
          ? `${pluralizeVisits(aggregate.totalFinished)} с отметкой — рейтинг появится после ${MIN_SAMPLE_FOR_BADGE}.`
          : "Пока нет визитов с отметкой статуса.",
    };
  }

  const detailParts = [
    `${aggregate.completed} из ${aggregate.totalFinished} визитов состоялись`,
  ];
  if (aggregate.noShows > 0) {
    detailParts.push(`${aggregate.noShows} неявок`);
  }
  if (aggregate.lateCancels > 0) {
    detailParts.push(`${aggregate.lateCancels} поздних отмен`);
  }
  const detailLabel = detailParts.join(", ");

  if (aggregate.reliabilityScore >= 80) {
    return {
      hasEnoughData: true,
      tone: "success",
      label: `Надёжный · ${aggregate.reliabilityScore}%`,
      detailLabel,
    };
  }

  if (aggregate.reliabilityScore >= 50) {
    return {
      hasEnoughData: true,
      tone: "warning",
      label: `Бывают пропуски · ${aggregate.reliabilityScore}%`,
      detailLabel,
    };
  }

  return {
    hasEnoughData: true,
    tone: "danger",
    label: `Высокий риск неявки · ${aggregate.reliabilityScore}%`,
    detailLabel,
  };
}

// Автоподсказка "поздно/заранее" при отметке отмены — финальное решение
// остаётся за мастером (кнопки позволяют переключить вручную), см. ТЗ 1.3.
export function suggestCancelVisitStatus(input: {
  startsAtIso: string;
  cancelledAtIso: string;
  timezone: string;
  lateCancelThresholdHours: number;
}): "cancelled_late" | "cancelled_ok" {
  const startsAt = DateTime.fromISO(input.startsAtIso, { zone: "utc" }).setZone(input.timezone);
  const cancelledAt = DateTime.fromISO(input.cancelledAtIso, { zone: "utc" }).setZone(
    input.timezone,
  );

  if (!startsAt.isValid || !cancelledAt.isValid) {
    return "cancelled_ok";
  }

  const hoursBeforeStart = startsAt.diff(cancelledAt, "hours").hours;

  return hoursBeforeStart < input.lateCancelThresholdHours ? "cancelled_late" : "cancelled_ok";
}
