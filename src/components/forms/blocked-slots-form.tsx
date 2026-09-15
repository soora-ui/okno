"use client";

import { useActionState } from "react";
import { DateTime } from "luxon";
import { Trash2 } from "lucide-react";
import {
  createBlockedSlotAction,
  deleteBlockedSlotAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BlockedSlot } from "@/lib/mock-data";

const initialState: SettingsActionState = {
  success: false,
  message: "",
};

export function BlockedSlotsForm({
  blockedSlots,
  timezone,
  defaultDate,
}: {
  blockedSlots: BlockedSlot[];
  timezone: string;
  defaultDate: string;
}) {
  const [state, action] = useActionState(createBlockedSlotAction, initialState);

  return (
    <div className="space-y-5">
      <div className="rounded-panel bg-panel p-4">
        <p className="font-medium text-ink">Что это такое</p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Ручная блокировка закрывает время для записи клиентов. Это удобно, если у тебя
          перерыв, личные дела, дорога, отпуск или окно уже занято вне сайта.
        </p>
      </div>

      <form action={action} className="space-y-4 rounded-panel border border-line p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Дата"
            name="date"
            type="date"
            defaultValue={defaultDate}
            required
          />
          <Input label="С" name="startTime" type="time" defaultValue="13:00" required />
          <Input label="До" name="endTime" type="time" defaultValue="14:00" required />
        </div>
        <Textarea
          label="Причина"
          name="reason"
          placeholder="Например: обед, закупка, личные дела, отпуск"
          hint="Время сразу станет недоступно для клиентов на публичной странице."
        />
        <FormMessage message={state.message} success={state.success} />
        <SubmitButton
          idleLabel="Заблокировать время"
          pendingLabel="Сохраняю блокировку..."
        />
      </form>

      <div className="space-y-3">
        {blockedSlots.length > 0 ? (
          blockedSlots.map((slot) => {
            const startsAt = DateTime.fromISO(slot.startsAt, {
              zone: "utc",
            }).setZone(timezone);
            const endsAt = DateTime.fromISO(slot.endsAt, {
              zone: "utc",
            }).setZone(timezone);

            return (
              <div
                key={slot.id}
                className="rounded-panel border border-line p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium text-ink">{slot.reason}</p>
                    <p className="text-sm text-ink-soft">
                      {startsAt.setLocale("ru").toFormat("d MMMM")} •{" "}
                      {startsAt.toFormat("HH:mm")} - {endsAt.toFormat("HH:mm")}
                    </p>
                  </div>
                  <form action={deleteBlockedSlotAction}>
                    <input type="hidden" name="blockedSlotId" value={slot.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel"
                    >
                      <Trash2 size={14} />
                      Удалить
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-panel border border-dashed border-line p-4 text-sm text-muted">
            Пока нет ручных блокировок. Если нужно закрыть часть дня для клиентов, добавь
            ее через форму выше.
          </div>
        )}
      </div>
    </div>
  );
}
