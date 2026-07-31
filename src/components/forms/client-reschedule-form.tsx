"use client";

import { useActionState, useMemo, useState } from "react";
import {
  initialPublicBookingActionState,
  rescheduleBookingByTokenAction,
} from "@/app/actions/public-bookings";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Select } from "@/components/ui/select";
import type { BookingSlot } from "@/lib/mock-data";

export function ClientRescheduleForm({
  cancellationToken,
  bookingSlots,
  disabled = false,
}: {
  cancellationToken: string;
  bookingSlots: BookingSlot[];
  disabled?: boolean;
}) {
  const [state, action] = useActionState(
    rescheduleBookingByTokenAction,
    initialPublicBookingActionState,
  );
  const [dateValue, setDateValue] = useState(bookingSlots[0]?.value ?? "");

  const selectedDate = useMemo(
    () => bookingSlots.find((slot) => slot.value === dateValue) ?? bookingSlots[0] ?? null,
    [bookingSlots, dateValue],
  );
  const [timeValue, setTimeValue] = useState(selectedDate?.times[0] ?? "");
  const resolvedTimeValue = selectedDate?.times.includes(timeValue)
    ? timeValue
    : (selectedDate?.times[0] ?? "");

  if (bookingSlots.length === 0) {
    return (
      <div className="rounded-panel border border-dashed border-line px-4 py-3 text-sm leading-6 text-muted">
        Свободных слотов для переноса пока нет. Можно попробовать отменить запись или
        связаться с мастером напрямую.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="cancellationToken" value={cancellationToken} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Новая дата"
          name="date"
          value={dateValue}
          onChange={(event) => {
            const nextDateValue = event.target.value;
            const nextDate = bookingSlots.find((slot) => slot.value === nextDateValue);
            setDateValue(nextDateValue);
            setTimeValue(nextDate?.times[0] ?? "");
          }}
          options={bookingSlots.map((slot) => ({
            value: slot.value,
            label: slot.date,
          }))}
        />
        <Select
          label="Новое время"
          name="time"
          value={resolvedTimeValue}
          onChange={(event) => setTimeValue(event.target.value)}
          options={(selectedDate?.times ?? []).map((time) => ({
            value: time,
            label: time,
          }))}
        />
      </div>
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton
        idleLabel="Перенести запись"
        pendingLabel="Переношу..."
        className="w-full"
        disabled={disabled || !selectedDate || !resolvedTimeValue}
      />
    </form>
  );
}
