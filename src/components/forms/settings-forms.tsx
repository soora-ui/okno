"use client";

import dynamic from "next/dynamic";
import { useActionState, useState } from "react";
import { Bot, EyeOff, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import {
  createServiceAction,
  updateAvailabilityAction,
  updateAccessAction,
  updateBookingPageSettingsAction,
  updateBookingPreferencesAction,
  updateGiftCertificateSettingsAction,
  updateProfileAction,
  updateServiceAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { saveServiceManualAction } from "@/app/actions/service-manuals";
import { startProSubscriptionAction } from "@/app/actions/subscription";
import {
  formatSubscriptionUntil,
  planPeriodDays,
  resolveSubscription,
} from "@/lib/subscription";
import {
  type PlanId,
  calculatePlanPriceRub,
  extraSeatPriceRub,
  formatPlanPrice,
  getPlan,
  pricingPlans,
} from "@/config/plans";
import {
  commentFieldModeLabels,
  commentFieldModes,
  defaultGiftCertificateDenominations,
  giftCertificateMaxAmount,
  giftCertificateMinAmount,
  headlineMaxLength,
  maxGiftCertificateDenominations,
  subheadlineMaxLength,
} from "@/lib/booking-page-settings";
import {
  manualConfirmationLabel,
  manualMaxLength,
  manualPlaceholder,
  type ServiceManualSummary,
} from "@/lib/service-manuals";
import { prepaymentTypeLabels } from "@/lib/prepayment";
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
        <div className="h-80 animate-pulse rounded-nested bg-panel" />
        <div className="h-96 animate-pulse rounded-nested border border-line bg-panel" />
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

        <form action={action} className="space-y-4 rounded-nested border border-line bg-surface p-5">
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
          <Input
            label="Точный адрес"
            name="address"
            defaultValue={profile.address}
            placeholder="ул. Пушкина, 12, кабинет 3"
            hint="Виден клиентам на странице записи. Город выбирается из списка выше."
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

const commentFieldModeOptions = commentFieldModes.map((mode) => ({
  value: mode,
  label: commentFieldModeLabels[mode],
}));

export function BookingPageSettingsForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(
    updateBookingPageSettingsAction,
    initialState,
  );
  const settings = profile.bookingPageSettings;

  return (
    <form action={action} className="space-y-4">
      <Input
        label="Заголовок на первом экране"
        name="headline"
        defaultValue={settings.headline}
        maxLength={headlineMaxLength}
        placeholder="Например: Аккуратный маникюр в удобное для вас время"
        hint={`Короткий тезис под именем мастера. До ${headlineMaxLength} символов.`}
      />
      <Textarea
        label="Подзаголовок"
        name="subheadline"
        defaultValue={settings.subheadline}
        maxLength={subheadlineMaxLength}
        placeholder="Например: Уютный кабинет в центре, запись без переписок"
        hint={`Пояснение на 1–2 строки. До ${subheadlineMaxLength} символов.`}
      />
      <Select
        label="Поле комментария в записи"
        name="commentFieldMode"
        defaultValue={settings.commentFieldMode}
        options={commentFieldModeOptions}
        hint="Можно скрыть поле, оставить по желанию или сделать обязательным."
      />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel="Сохранить" pendingLabel="Сохраняю..." />
    </form>
  );
}

export function GiftCertificateSettingsForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(
    updateGiftCertificateSettingsAction,
    initialState,
  );
  const settings = profile.bookingPageSettings;
  const [denominationsText, setDenominationsText] = useState(
    settings.giftCertificateDenominations.join(", "),
  );
  const [noExpiry, setNoExpiry] = useState(settings.giftCertificateNoExpiry);
  const [expiryDate, setExpiryDate] = useState(settings.giftCertificateExpiryDate ?? "");

  return (
    <form action={action} className="space-y-4">
      <Input
        label="Номиналы, руб."
        name="denominations"
        value={denominationsText}
        onChange={(event) => setDenominationsText(event.target.value)}
        placeholder={`Например: ${defaultGiftCertificateDenominations.join(", ")}`}
        hint={`Через запятую, от ${giftCertificateMinAmount} до ${giftCertificateMaxAmount} руб., максимум ${maxGiftCertificateDenominations} значений.`}
      />
      <div className="space-y-2">
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input
            type="checkbox"
            name="noExpiry"
            value="on"
            checked={noExpiry}
            onChange={(event) => {
              setNoExpiry(event.target.checked);
              if (event.target.checked) {
                setExpiryDate("");
              }
            }}
            className="h-5 w-5 rounded border-line"
          />
          Без срока действия
        </label>
        <Input
          label="Или срок действия до"
          name="expiryDate"
          type="date"
          value={expiryDate}
          onChange={(event) => {
            setExpiryDate(event.target.value);
            if (event.target.value) {
              setNoExpiry(false);
            }
          }}
          hint="Применяется к сертификатам, выпущенным после сохранения настроек — уже проданные сохраняют прежний срок."
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
              className={`rounded-panel border p-4 transition ${
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
                    className="min-h-10 rounded-tight border border-line bg-surface px-3 text-sm text-ink outline-none"
                  />
                  <span className="text-xs text-muted">—</span>
                  <input
                    name={`end_${day.value}`}
                    type="time"
                    defaultValue={rule?.endTime ?? "18:00"}
                    className="min-h-10 rounded-tight border border-line bg-surface px-3 text-sm text-ink outline-none"
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

export function SubscriptionSettingsForm({
  profile,
  activeSeats = 0,
}: {
  profile: Profile;
  activeSeats?: number;
}) {
  const [state, action] = useActionState(startProSubscriptionAction, initialState);
  const access = resolveSubscription(profile);
  const currentPlan = access.planId ? getPlan(access.planId) : null;
  const untilLabel = formatSubscriptionUntil(access.activeUntil);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(
    access.planId ?? "solo-basic",
  );

  const statusTitle = currentPlan
    ? `Тариф «${currentPlan.title}»`
    : access.isTrial
      ? "Пробный период"
      : "Тариф не подключён";

  const statusHint = currentPlan
    ? untilLabel
      ? `Активен до ${untilLabel}`
      : "Активен бессрочно"
    : access.isTrial
      ? untilLabel
        ? `Бесплатный доступ до ${untilLabel}, дальше нужен тариф`
        : "Бесплатный доступ к полному сервису"
      : "Публичная запись у клиентов не работает, пока тариф не оплачен";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-panel px-4 py-4">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="text-accent-deep" />
          <div>
            <p className="text-sm font-semibold text-ink">{statusTitle}</p>
            <p className="mt-1 text-xs text-ink-soft">{statusHint}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            access.isActive ? "bg-success-soft text-success" : "bg-surface text-muted"
          }`}
        >
          {currentPlan ? currentPlan.title : access.isTrial ? "Пробный" : "Нет доступа"}
        </span>
      </div>

      <form action={action} className="space-y-3">
        <div className="space-y-2">
          {pricingPlans.map((plan) => {
            const total = calculatePlanPriceRub(plan.id, activeSeats);
            const paidSeats = Math.max(0, activeSeats - plan.includedSeats);

            return (
              <label
                key={plan.id}
                className={`flex cursor-pointer items-start gap-3 rounded-panel border p-4 transition ${
                  selectedPlanId === plan.id
                    ? "border-accent-deep bg-panel"
                    : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="planId"
                  value={plan.id}
                  checked={selectedPlanId === plan.id}
                  onChange={() => setSelectedPlanId(plan.id)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{plan.title}</span>
                    <span className="text-sm font-semibold text-ink">
                      {formatPlanPrice(total)} / {planPeriodDays} дней
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-ink-soft">
                    {plan.description}
                  </span>
                  {paidSeats > 0 ? (
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      Включает доплату за {paidSeats} сотрудников сверх{" "}
                      {plan.includedSeats}: {formatPlanPrice(plan.priceRub)} +{" "}
                      {paidSeats} × {formatPlanPrice(extraSeatPriceRub)}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        <p className="text-xs leading-5 text-muted">
          Оплата разовая за {planPeriodDays} дней, автосписания нет — продлевать нужно вручную.
        </p>

        <FormMessage message={state.message} success={state.success} />
        <SubmitButton
          idleLabel={currentPlan ? "Продлить или сменить тариф" : "Подключить тариф"}
          pendingLabel="Открываю оплату..."
        />
      </form>
    </div>
  );
}

export function ServicesSettingsForm({
  services,
  manualsByServiceId = {},
  hasProAccess = false,
  isYooKassaConnected = false,
}: {
  services: Service[];
  manualsByServiceId?: Record<string, ServiceManualSummary>;
  hasProAccess?: boolean;
  isYooKassaConnected?: boolean;
}) {
  const [createState, createAction] = useActionState(createServiceAction, initialState);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {services.map((service) => (
          <ServiceEditor
            key={service.id}
            service={service}
            manual={manualsByServiceId[service.id]}
            hasProAccess={hasProAccess}
            isYooKassaConnected={isYooKassaConnected}
          />
        ))}
      </div>

      <form action={createAction} className="space-y-4 rounded-panel border border-dashed border-line p-4">
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
        <UnitInput
          label="Повторный визит через"
          unit="нед"
          name="repeatIntervalWeeks"
          placeholder="Например, 3"
          hint="Если заполнено, клиент сможет отметить напоминание о повторном визите при записи."
          required={false}
        />
        <PrepaymentFields isYooKassaConnected={isYooKassaConnected} />
        <input type="hidden" name="sortOrder" value={String(services.length + 1)} />
        <FormMessage message={createState.message} success={createState.success} />
        <SubmitButton idleLabel="Добавить" pendingLabel="Добавляю..." />
      </form>
    </div>
  );
}

function ServiceEditor({
  service,
  manual,
  hasProAccess,
  isYooKassaConnected,
}: {
  service: Service;
  manual?: ServiceManualSummary;
  hasProAccess: boolean;
  isYooKassaConnected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateServiceAction, initialState);

  return (
    <div className="space-y-3">
    <form action={action} className="space-y-4 rounded-panel border border-line bg-surface p-4">
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
          className="inline-flex items-center justify-center gap-2 rounded-tight border border-line px-4 py-3 text-sm font-medium text-ink transition hover:bg-panel"
        >
          <Pencil size={14} />
          {open ? "Свернуть" : "Редактировать"}
        </button>
        <button
          type="submit"
          name="visibilityAction"
          value={service.isActive ? "hide" : "show"}
          className="inline-flex items-center justify-center gap-2 rounded-tight border border-line px-4 py-3 text-sm font-medium text-ink transition hover:bg-panel"
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
          <UnitInput
            label="Повторный визит через"
            unit="нед"
            name="repeatIntervalWeeks"
            defaultValue={
              service.repeatIntervalWeeks ? String(service.repeatIntervalWeeks) : ""
            }
            placeholder="Например, 3"
            hint="Если заполнено, клиент сможет отметить напоминание о повторном визите при записи."
            required={false}
          />
          <PrepaymentFields
            defaultType={service.prepaymentType}
            defaultValue={service.prepaymentValue}
            isYooKassaConnected={isYooKassaConnected}
          />
          <FormMessage message={state.message} success={state.success} />
          <SubmitButton idleLabel="Сохранить" pendingLabel="Сохраняю..." />
        </>
      ) : (
        <FormMessage message={state.message} success={state.success} />
      )}
    </form>
      <ServiceManualEditor
        serviceId={service.id}
        manual={manual}
        hasProAccess={hasProAccess}
      />
    </div>
  );
}

function ServiceManualEditor({
  serviceId,
  manual,
  hasProAccess,
}: {
  serviceId: string;
  manual?: ServiceManualSummary;
  hasProAccess: boolean;
}) {
  if (!hasProAccess) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-dashed border-line bg-panel p-4">
        <div className="flex items-center gap-3">
          <Bot size={16} className="text-muted" />
          <div>
            <h4 className="text-sm font-semibold text-ink">AI-консультация</h4>
            <p className="mt-1 text-xs text-ink-soft">
              Входит в тарифы «Соло. Расширенный» и «Студия и барбершоп» — подключить
              можно во вкладке «Аккаунт».
            </p>
          </div>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
          PRO
        </span>
      </div>
    );
  }

  return <ServiceManualEditorForm serviceId={serviceId} manual={manual} />;
}

function ServiceManualEditorForm({
  serviceId,
  manual,
}: {
  serviceId: string;
  manual?: ServiceManualSummary;
}) {
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [state, action] = useActionState(saveServiceManualAction, initialState);

  const statusLabel = manual?.isConfirmed
    ? `Подтверждён · версия ${manual.version}${
        manual.confirmedAtLabel ? ` · ${manual.confirmedAtLabel}` : ""
      }`
    : "Не настроен";

  return (
    <form
      action={action}
      className="space-y-4 rounded-panel border border-line bg-panel p-4"
    >
      <input type="hidden" name="serviceId" value={serviceId} />
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bot size={16} className="text-accent-deep" />
          <div>
            <h4 className="text-sm font-semibold text-ink">AI-консультация</h4>
            <p className="mt-1 text-xs text-ink-soft">Мануал по услуге · {statusLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-tight border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface"
        >
          {open ? "Свернуть" : manual?.isConfirmed ? "Изменить" : "Настроить"}
        </button>
      </div>

      {open ? (
        <>
          <Textarea
            label="Мануал по этой услуге"
            name="content"
            defaultValue={manual?.content ?? ""}
            placeholder={manualPlaceholder}
            hint="Бот отвечает клиентам строго по этому тексту и не достраивает ответы из общих знаний. Чего нет в мануале — на то бот ответит «не знаю»."
            maxLength={manualMaxLength}
            className="min-h-48 whitespace-pre-wrap"
          />
          <label className="flex items-start gap-3 rounded-field border border-line bg-surface px-4 py-3">
            <input
              type="checkbox"
              name="confirmed"
              checked={agree}
              onChange={(event) => setAgree(event.target.checked)}
              className="mt-1 size-4 shrink-0 accent-[var(--color-ink)]"
            />
            <span className="flex items-start gap-2 text-sm text-ink-soft">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent-deep" />
              {manualConfirmationLabel}
            </span>
          </label>
          <FormMessage message={state.message} success={state.success} />
          <SubmitButton
            idleLabel="Сохранить и подтвердить"
            pendingLabel="Сохраняю..."
            disabled={!agree}
          />
        </>
      ) : (
        <FormMessage message={state.message} success={state.success} />
      )}
    </form>
  );
}

const prepaymentTypeOptions = (
  ["none", "fixed", "percent"] as const
).map((value) => ({ value, label: prepaymentTypeLabels[value] }));

// Настройка предоплаты на услуге — Модуль 2 (okno-tz-rating-prepayment.md,
// ТЗ 2.2). Переключатель "выключена / фикс. сумма / процент" + поле
// значения. Валидация диапазонов (fixed <= цены, percent 1-100) — на
// сервере в updateServiceAction/createServiceAction, см. validatePrepaymentSetting.
function PrepaymentFields({
  defaultType = "none",
  defaultValue = 0,
  isYooKassaConnected = false,
}: {
  defaultType?: "none" | "fixed" | "percent";
  defaultValue?: number;
  isYooKassaConnected?: boolean;
}) {
  const [prepaymentType, setPrepaymentType] = useState(defaultType);

  // Без подключенной и активной ЮKassa включить предоплату нельзя — деньги
  // некуда проводить (okno-tz-yookassa-oauth.md). Сервер перепроверяет то же
  // самое в createServiceAction/updateServiceAction, это лишь UI-подсказка.
  if (!isYooKassaConnected) {
    return (
      <div className="space-y-2 rounded-panel border border-dashed border-line p-3">
        <p className="text-sm font-medium text-ink">Предоплата: выключена</p>
        <p className="text-sm leading-6 text-ink-soft">
          Чтобы клиенты могли вносить предоплату за эту услугу, сначала подключи ЮKassa —
          блок «Приём предоплаты» над списком услуг.
        </p>
        <input type="hidden" name="prepaymentType" value="none" />
        <input type="hidden" name="prepaymentValue" value="0" />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-panel border border-dashed border-line p-3">
      <Select
        label="Предоплата"
        name="prepaymentType"
        value={prepaymentType}
        onChange={(event) =>
          setPrepaymentType(event.currentTarget.value as "none" | "fixed" | "percent")
        }
        options={prepaymentTypeOptions}
        hint="Клиент платит предоплату при записи на эту услугу через ЮKassa."
      />
      {prepaymentType !== "none" ? (
        <UnitInput
          label={prepaymentType === "percent" ? "Значение предоплаты" : "Сумма предоплаты"}
          unit={prepaymentType === "percent" ? "%" : "₽"}
          name="prepaymentValue"
          defaultValue={defaultValue > 0 ? String(defaultValue) : ""}
          placeholder={prepaymentType === "percent" ? "50" : "500"}
        />
      ) : (
        <input type="hidden" name="prepaymentValue" value="0" />
      )}
    </div>
  );
}

function UnitInput({
  label,
  unit,
  name,
  defaultValue,
  placeholder,
  hint,
  required = true,
}: {
  label: string;
  unit: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <div className="flex min-h-12 items-center rounded-field border border-line bg-surface px-4">
        <input
          name={name}
          type="number"
          defaultValue={defaultValue}
          placeholder={placeholder}
          inputMode="numeric"
          className="w-full bg-transparent text-sm text-ink outline-none"
          required={required}
        />
        <span className="ml-3 text-xs text-muted">{unit}</span>
      </div>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
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
    <div className="rounded-panel bg-panel p-4">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        {description}
      </p>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        defaultValue={defaultValue}
        className="mt-2 min-h-10 w-full rounded-tight border border-line bg-surface px-3 text-sm font-medium text-ink outline-none"
        required
      />
      <p className="mt-2 text-xs text-muted">{unit}</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {example}
      </p>
    </div>
  );
}
