"use client";

import dynamic from "next/dynamic";
import { useActionState, useState } from "react";
import { EyeOff, Pencil } from "lucide-react";
import {
  createServiceAction,
  updateAvailabilityAction,
  updateAccessAction,
  updateBookingPreferencesAction,
  updateProfileAction,
  updateServiceAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cityOptions,
  resolveCityValue,
} from "@/lib/cities";
import type { AvailabilityRule, Profile, Service } from "@/lib/mock-data";

const ProfileMediaUploadSection = dynamic(
  () =>
    import("@/components/settings/profile-media-upload-section").then(
      (mod) => mod.ProfileMediaUploadSection,
    ),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="h-80 animate-pulse rounded-[24px] bg-panel" />
        <div className="h-96 animate-pulse rounded-[24px] border border-line bg-panel" />
      </div>
    ),
  },
);

const initialState: SettingsActionState = {
  success: false,
  message: "",
};

export function ProfileSettingsForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(updateProfileAction, initialState);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <ProfileMediaUploadSection profile={profile} />

        <form action={action} className="space-y-4 rounded-[24px] border border-line bg-surface p-5">
          <Input
            label="Имя мастера"
            name="fullName"
            defaultValue={profile.fullName}
            required
          />
          <Input
            label="Ниша"
            name="specialty"
            defaultValue={profile.specialty}
            required
          />
          <Select
            label="Город"
            name="city"
            defaultValue={resolveCityValue({
              locationText: profile.locationText,
              timezone: profile.timezone,
            })}
            options={cityOptions}
            hint="Часовой пояс записей и уведомлений определим автоматически."
          />
          <Textarea
            label="О себе"
            name="bio"
            defaultValue={profile.bio}
            placeholder="Пара слов о мастере и атмосфере приема"
          />
          <FormMessage message={state.message} success={state.success} />
          <SubmitButton idleLabel="Сохранить" pendingLabel="Сохраняю..." />
        </form>
      </div>
    </div>
  );
}

export function AccessSettingsForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(updateAccessAction, initialState);

  return (
    <form action={action} className="space-y-4">
      <Input label="Email для входа" name="email" type="email" defaultValue={profile.email} required />
      <Input
        label="Текущий пароль"
        name="currentPassword"
        type="password"
        placeholder="Введите текущий пароль"
        hint="Без текущего пароля email и пароль не изменятся."
        required
      />
      <Input
        label="Новый пароль"
        name="password"
        type="password"
        placeholder="Оставь пустым, если менять не нужно"
        hint="Минимум 8 символов."
      />
      <Input
        label="Подтверждение нового пароля"
        name="confirmPassword"
        type="password"
        placeholder="Повтори новый пароль"
      />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel="Сохранить" pendingLabel="Сохраняю..." />
    </form>
  );
}

export function BookingPreferencesForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(
    updateBookingPreferencesAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ParameterField
          label="Окно записи"
          unit="дней вперед"
          name="bookingWindowDays"
          defaultValue={String(profile.bookingWindowDays)}
          description="На сколько дней вперед клиент может выбрать дату."
          example="Если стоит 30, запись будет открыта на ближайшие 30 дней."
        />
        <ParameterField
          label="С каким шагом показывать время"
          unit="минут"
          name="slotIntervalMinutes"
          defaultValue={String(profile.slotIntervalMinutes)}
          description="Через какой интервал клиент видит доступное время."
          example="30 минут = 10:00, 10:30, 11:00 и дальше."
        />
        <ParameterField
          label="Перерыв после записи"
          unit="минут"
          name="bufferMinutes"
          defaultValue={String(profile.bufferMinutes)}
          description="Дополнительное время после клиента, чтобы не ставить записи вплотную."
          example="15 минут = после визита в 10:00 следующий слот начнется не сразу."
        />
        <ParameterField
          label="Отмена не позже"
          unit="часов до визита"
          name="cancellationNoticeHours"
          defaultValue={String(profile.cancellationNoticeHours)}
          description="За сколько часов до визита клиент еще может отменить запись сам."
          example="2 часа = позже этого времени отмена уже недоступна."
        />
        <ParameterField
          label="Напомнить клиенту"
          unit="часов до визита"
          name="clientReminderHours"
          defaultValue={String(profile.clientReminderHours)}
          description="За сколько часов до визита клиенту придет напоминание."
          example="24 часа = за день до записи. 0 = отключить."
        />
        <ParameterField
          label="Напомнить мастеру"
          unit="часов до визита"
          name="masterReminderHours"
          defaultValue={String(profile.masterReminderHours)}
          description="За сколько часов до визита мастер получит напоминание в Telegram."
          example="2 часа = напоминание за пару часов до клиента. 0 = отключить."
        />
      </div>
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel="Сохранить" pendingLabel="Сохраняю..." />
    </form>
  );
}

const weekdays = [
  { value: 1, label: "Понедельник" },
  { value: 2, label: "Вторник" },
  { value: 3, label: "Среда" },
  { value: 4, label: "Четверг" },
  { value: 5, label: "Пятница" },
  { value: 6, label: "Суббота" },
  { value: 7, label: "Воскресенье" },
];

export function AvailabilitySettingsForm({
  availabilityRules,
}: {
  availabilityRules: AvailabilityRule[];
}) {
  const [state, action] = useActionState(updateAvailabilityAction, initialState);
  const [enabledDays, setEnabledDays] = useState<Record<number, boolean>>(
    Object.fromEntries(
      weekdays.map((day) => [
        day.value,
        Boolean(availabilityRules.find((item) => item.weekday === day.value)?.isActive),
      ]),
    ),
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        {weekdays.map((day) => {
          const rule = availabilityRules.find((item) => item.weekday === day.value);
          const enabled = enabledDays[day.value] ?? false;

          return (
            <div
              key={day.value}
              className={`rounded-[18px] border p-4 transition ${
                enabled
                  ? "border-ink bg-panel"
                  : "border-line bg-surface"
              }`}
            >
              <input
                type="checkbox"
                name={`active_${day.value}`}
                checked={enabled}
                onChange={() =>
                  setEnabledDays((current) => ({
                    ...current,
                    [day.value]: !current[day.value],
                  }))
                }
                className="sr-only"
              />
              <div className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                <button
                  type="button"
                  onClick={() =>
                    setEnabledDays((current) => ({
                      ...current,
                      [day.value]: !current[day.value],
                    }))
                  }
                  className={`relative h-6 w-11 rounded-full border transition ${
                    enabled
                      ? "border-ink bg-ink"
                      : "border-line bg-panel"
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-4 w-4 rounded-full bg-surface transition ${
                      enabled ? "left-[23px]" : "left-[3px]"
                    }`}
                  />
                </button>
                <div className="text-sm font-medium text-ink">
                  {day.label}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    name={`start_${day.value}`}
                    type="time"
                    defaultValue={rule?.startTime ?? "09:00"}
                    className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none"
                  />
                  <span className="text-xs text-muted">—</span>
                  <input
                    name={`end_${day.value}`}
                    type="time"
                    defaultValue={rule?.endTime ?? "18:00"}
                    className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel="Сохранить расписание" pendingLabel="Сохраняю..." />
    </form>
  );
}

export function ServicesSettingsForm({ services }: { services: Service[] }) {
  const [createState, createAction] = useActionState(createServiceAction, initialState);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {services.map((service) => (
          <ServiceEditor key={service.id} service={service} />
        ))}
      </div>

      <form action={createAction} className="space-y-4 rounded-[20px] border border-dashed border-line p-4">
        <h3 className="text-lg font-semibold text-ink">Новая услуга</h3>
        <Input label="Название" name="title" placeholder="Маникюр без покрытия" required />
        <Textarea
          label="Описание"
          name="description"
          placeholder="Кратко опиши, что входит в услугу"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <UnitInput label="Длительность" unit="мин" name="durationMinutes" placeholder="60" />
          <UnitInput label="Цена" unit="₽" name="price" placeholder="1500" />
        </div>
        <input type="hidden" name="sortOrder" value={String(services.length + 1)} />
        <FormMessage message={createState.message} success={createState.success} />
        <SubmitButton idleLabel="Добавить" pendingLabel="Добавляю..." />
      </form>
    </div>
  );
}

function ServiceEditor({ service }: { service: Service }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateServiceAction, initialState);

  return (
    <form action={action} className="space-y-4 rounded-[18px] border border-line bg-surface p-4">
      <input type="hidden" name="serviceId" value={service.id} />
      <input type="hidden" name="sortOrder" value={String(service.sortOrder || 1)} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">{service.title}</h3>
          <div className="mt-2 flex gap-4 text-sm text-ink-soft">
            <span>{service.durationMinutes} мин</span>
            <span>{service.price} ₽</span>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            service.isActive
              ? "bg-success-soft text-success"
              : "bg-panel text-muted"
          }`}
        >
          {service.isActive ? "Активна" : "Скрыта"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-medium text-ink transition hover:bg-panel"
        >
          <Pencil size={14} />
          {open ? "Свернуть" : "Редактировать"}
        </button>
        <button
          type="submit"
          name="visibilityAction"
          value={service.isActive ? "hide" : "show"}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-medium text-ink transition hover:bg-panel"
        >
          <EyeOff size={14} />
          {service.isActive ? "Скрыть" : "Показать"}
        </button>
      </div>

      {open ? (
        <>
          <input type="hidden" name="isActive" value={service.isActive ? "on" : ""} />
          <Input label="Название" name="title" defaultValue={service.title} required />
          <Textarea label="Описание" name="description" defaultValue={service.description} />
          <div className="grid gap-4 sm:grid-cols-2">
            <UnitInput
              label="Длительность"
              unit="мин"
              name="durationMinutes"
              defaultValue={String(service.durationMinutes)}
            />
            <UnitInput
              label="Цена"
              unit="₽"
              name="price"
              defaultValue={String(service.price)}
            />
          </div>
          <FormMessage message={state.message} success={state.success} />
          <SubmitButton idleLabel="Сохранить" pendingLabel="Сохраняю..." />
        </>
      ) : (
        <FormMessage message={state.message} success={state.success} />
      )}
    </form>
  );
}

function UnitInput({
  label,
  unit,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  unit: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <div className="flex min-h-12 items-center rounded-2xl border border-line bg-surface px-4">
        <input
          name={name}
          type="number"
          defaultValue={defaultValue}
          placeholder={placeholder}
          inputMode="numeric"
          className="w-full bg-transparent text-[15px] text-ink outline-none"
          required
        />
        <span className="ml-3 text-xs text-muted">{unit}</span>
      </div>
    </label>
  );
}

function ParameterField({
  label,
  unit,
  name,
  defaultValue,
  description,
  example,
}: {
  label: string;
  unit: string;
  name: string;
  defaultValue: string;
  description: string;
  example: string;
}) {
  return (
    <div className="rounded-[18px] bg-panel p-4">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        {description}
      </p>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        defaultValue={defaultValue}
        className="mt-2 min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink outline-none"
        required
      />
      <p className="mt-2 text-xs text-muted">{unit}</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {example}
      </p>
    </div>
  );
}
