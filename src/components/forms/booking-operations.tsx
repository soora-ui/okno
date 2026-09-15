"use client";

import { useActionState, useState, useTransition } from "react";
import {
  cancelBookingByMasterAction,
  createManualBookingAction,
  setVisitStatusAction,
  updateClientNotesAction,
  type BookingOperationActionState,
} from "@/app/actions/bookings";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Profile, Service } from "@/lib/mock-data";
import type { VisitStatus } from "@/lib/client-reliability";
import { suggestCancelVisitStatus } from "@/lib/client-reliability";

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
      <div className="rounded-panel bg-panel px-4 py-3 text-sm text-muted">
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

// Отметка статуса прошедшего визита — Модуль 1 (рейтинг надёжности клиентов)
// из okno-tz-rating-prepayment.md, ТЗ 1.3.А. Система лишь подсказывает
// "поздно/заранее" по факту времени; финальное решение остаётся за мастером.
//
// Выбор фиксируется сразу на клиенте: после клика остальные варианты
// прячутся, чтобы мастер не успел нажать второй статус, пока сервер думает.
// Если сервер ответил ошибкой — кнопки возвращаются вместе с текстом ошибки.
const visitStatusChoices: Array<{ visitStatus: VisitStatus; label: string }> = [
  { visitStatus: "completed", label: "Пришёл" },
  { visitStatus: "no_show", label: "Не пришёл" },
  { visitStatus: "cancelled_ok", label: "Отменил заранее" },
  { visitStatus: "cancelled_late", label: "Отменил поздно" },
];

export function VisitStatusForm({
  bookingId,
  startsAtIso,
  timezone,
  lateCancelThresholdHours,
}: {
  bookingId: string;
  startsAtIso: string;
  timezone: string;
  lateCancelThresholdHours: number;
}) {
  const [state, formAction, isPending] = useActionState(setVisitStatusAction, initialState);
  const [chosen, setChosen] = useState<VisitStatus | null>(null);
  const [, startTransition] = useTransition();

  const suggestedCancelStatus = suggestCancelVisitStatus({
    startsAtIso,
    cancelledAtIso: new Date().toISOString(),
    timezone,
    lateCancelThresholdHours,
  });

  const choose = (visitStatus: VisitStatus) => {
    if (isPending) {
      return;
    }

    setChosen(visitStatus);
    const formData = new FormData();
    formData.set("bookingId", bookingId);
    formData.set("visitStatus", visitStatus);
    startTransition(() => formAction(formData));
  };

  // После успеха карточку перерисует сервер уже с бейджем; до этого момента
  // (и всё время, пока запрос в пути) держим выбранный статус на экране.
  const chosenChoice =
    chosen && (isPending || state.success)
      ? visitStatusChoices.find((choice) => choice.visitStatus === chosen) ?? null
      : null;

  if (chosenChoice) {
    return (
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-muted">Отметка визита</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{chosenChoice.label}</Badge>
          <span className="text-xs text-muted">Сохраняю…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">
        Отметь, что было с визитом
      </p>
      <div className="grid grid-cols-2 gap-2">
        {visitStatusChoices.map((choice) => (
          <button
            key={choice.visitStatus}
            type="button"
            onClick={() => choose(choice.visitStatus)}
            className="w-full rounded-tight border border-line px-3 py-2 text-xs font-medium text-ink transition hover:bg-panel"
          >
            {choice.label}
          </button>
        ))}
      </div>
      {!state.success && state.message ? (
        <FormMessage message={state.message} success={false} />
      ) : null}
      <p className="text-xs text-muted">
        Подсказка по времени отмены: «
        {suggestedCancelStatus === "cancelled_late" ? "отменил поздно" : "отменил заранее"}
        » — финальный выбор за тобой.
      </p>
    </div>
  );
}
