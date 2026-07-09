"use client";

import { useActionState } from "react";
import {
  cancelBookingByMasterAction,
  createManualBookingAction,
  updateClientNotesAction,
  type BookingOperationActionState,
} from "@/app/actions/bookings";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Profile, Service } from "@/lib/mock-data";

const initialState: BookingOperationActionState = {
  success: false,
  message: "",
};

export function ManualBookingForm({
  services,
  profile,
  defaultDate,
}: {
  services: Service[];
  profile: Profile;
  defaultDate: string;
}) {
  const [state, action] = useActionState(createManualBookingAction, initialState);

  if (services.length === 0) {
    return (
      <div className="rounded-[20px] bg-panel px-4 py-3 text-sm text-muted">
        Сначала добавь хотя бы одну услугу, и после этого ручные записи станут доступны.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Клиент" name="name" placeholder="Имя клиента" required />
        <Input
          label="Телефон"
          name="phone"
          placeholder="+7 978 000-00-00"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          pattern="^\\+?[0-9\\s()\\-]{10,20}$"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Услуга"
          name="serviceId"
          defaultValue={services[0]?.id}
          options={services.map((service) => ({
            value: service.id,
            label: `${service.title} · ${service.durationMinutes} мин`,
          }))}
        />
        <Input
          label="Дата"
          name="date"
          type="date"
          defaultValue={defaultDate}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Время"
          name="time"
          type="time"
          defaultValue="10:00"
          required
        />
        <Input
          label="Город мастера"
          value={profile.locationText}
          disabled
          readOnly
          hint="Время ручной записи будет создано по настройкам этого мастера."
        />
      </div>
      <Textarea
        label="Комментарий к записи"
        name="note"
        placeholder="Например: записано по звонку, клиент просил утро"
      />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton
        idleLabel="Создать запись"
        pendingLabel="Создаю..."
      />
    </form>
  );
}

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [state, action] = useActionState(cancelBookingByMasterAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button
        type="submit"
        variant="secondary"
        className="w-full min-w-0 px-4 py-2 text-sm whitespace-nowrap"
      >
        Отменить запись
      </Button>
      <FormMessage message={state.message} success={state.success} />
    </form>
  );
}

export function ClientNotesForm({
  clientId,
  notes,
}: {
  clientId: string;
  notes: string;
}) {
  const [state, action] = useActionState(updateClientNotesAction, initialState);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <Textarea
        label="Заметки о клиенте"
        name="notes"
        defaultValue={notes}
        placeholder="Например: аллергия на гель, любит утренние слоты"
        className="min-h-24"
      />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton
        idleLabel="Сохранить заметку"
        pendingLabel="Сохраняю..."
      />
    </form>
  );
}
