// Настраиваемая предоплата по услугам (Модуль 2 из okno-tz-rating-prepayment.md).
// Термины ТЗ адаптированы под реальную схему: appointments -> bookings,
// masters -> profiles.

export type PrepaymentType = "none" | "fixed" | "percent";
export type PrepaymentStatus = "pending" | "paid" | "failed" | "refunded" | "expired";

// Слот резервируется на 15 минут под оплату (ТЗ 2.1). Если оплата не пришла
// за это время — слот освобождается фоновой job (см. api/jobs/prepayments).
export const prepaymentReservationMinutes = 15;

export const prepaymentTypeLabels: Record<PrepaymentType, string> = {
  none: "Выключена",
  fixed: "Фиксированная сумма",
  percent: "Процент от стоимости",
};

// Считает сумму предоплаты по типу и значению, зафиксированным на услуге в
// момент создания записи. fixed — сумма как есть, percent — доля от цены.
export function computePrepaymentAmount(input: {
  prepaymentType: PrepaymentType;
  prepaymentValue: number;
  servicePrice: number;
}): number {
  if (input.prepaymentType === "none") {
    return 0;
  }

  if (input.prepaymentType === "fixed") {
    return Math.max(0, input.prepaymentValue);
  }

  // percent
  return Math.round((input.servicePrice * Math.max(0, Math.min(100, input.prepaymentValue))) / 100);
}

// Валидация настройки предоплаты на услуге (ТЗ 2.2): percent в [1, 100],
// fixed > 0 и <= цены услуги (не давать поставить предоплату больше полной
// стоимости).
export function validatePrepaymentSetting(input: {
  prepaymentType: PrepaymentType;
  prepaymentValue: number;
  servicePrice: number;
}): { ok: true } | { ok: false; message: string } {
  if (input.prepaymentType === "none") {
    return { ok: true };
  }

  if (input.prepaymentType === "percent") {
    if (input.prepaymentValue < 1 || input.prepaymentValue > 100) {
      return { ok: false, message: "Процент предоплаты должен быть от 1 до 100." };
    }
    return { ok: true };
  }

  // fixed
  if (input.prepaymentValue <= 0) {
    return { ok: false, message: "Сумма предоплаты должна быть больше нуля." };
  }

  if (input.prepaymentValue > input.servicePrice) {
    return {
      ok: false,
      message: "Предоплата не может быть больше полной стоимости услуги.",
    };
  }

  return { ok: true };
}
