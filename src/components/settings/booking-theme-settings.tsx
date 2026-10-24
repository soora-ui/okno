"use client";

import { useActionState, useState } from "react";
import {
  bookingThemePresets,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";
import { updateBookingThemePresetAction } from "@/app/actions/settings";
import { BookingThemePreviewSplit } from "@/components/booking/booking-theme-preview";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import type { Profile, Service } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const initialState = {
  success: false,
  message: "",
};

export function BookingThemeSettings({
  profile,
  services,
  locked = false,
}: {
  profile: Profile;
  services: Service[];
  // Действует фирменный стиль: пресеты видны, но выбрать их можно только
  // после возврата к стандартному (макет 4.0-C).
  locked?: boolean;
}) {
  const [state, action] = useActionState(
    updateBookingThemePresetAction,
    initialState,
  );
  const [selectedPresetId, setSelectedPresetId] = useState<BookingThemePresetId>(
    profile.bookingThemePresetId,
  );
  const previewServices = services
    .filter((service) => service.isActive)
    .slice(0, 2)
    .map((service) => service.title);

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* Без data-settings-form: форма живёт в окне «Оформление страницы»
          (портал вне раздела настроек), и общая панель сохранения её не
          видит — сохраняет своя кнопка. */}
      <form
        action={action}
        className="min-w-0 space-y-4 rounded-nested border border-line bg-surface p-5"
      >
        <input
          type="hidden"
          name="bookingThemePreset"
          value={selectedPresetId}
        />

        {/* Что пресет действует на профиль, запись и подтверждение, говорит
            шапка окна «Оформление страницы» — здесь только выбор. */}
        {locked ? (
          <div className="space-y-2">
            <Badge>Не используются</Badge>
            <p className="text-sm leading-6 text-ink-soft">
              Сейчас действует фирменный стиль. Выбрать пресет можно после
              возврата к стандартному.
            </p>
          </div>
        ) : null}

        <fieldset disabled={locked} className={cn("grid gap-3", locked && "opacity-50")}>
          {bookingThemePresets.map((preset) => (
            <label
              key={preset.id}
              className={cn(
                "cursor-pointer rounded-panel border p-4 transition",
                selectedPresetId === preset.id
                  ? "border-ink bg-panel"
                  : "border-line bg-surface hover:bg-panel",
              )}
            >
              <input
                type="radio"
                value={preset.id}
                checked={selectedPresetId === preset.id}
                onChange={() => setSelectedPresetId(preset.id)}
                className="sr-only"
              />

              {/* Палитры идут под текстом, а не сбоку: сбоку они забирали
                  136px из 298 и описание сжималось в столбик шириной 116px. */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="font-medium text-ink">{preset.label}</p>
                  <p className="text-sm leading-6 text-muted">
                    {preset.description}
                  </p>
                </div>

                {/* Две пары: пресет живёт светлой и тёмной темой сразу, и по
                    одному ряду непонятно, во что он превратится на тёмном
                    телефоне клиента. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {(
                    [
                      { key: "light", label: "Светлая", colors: preset.swatches },
                      { key: "dark", label: "Тёмная", colors: preset.darkSwatches },
                    ] as const
                  ).map((row) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <span className="text-xs text-muted">{row.label}</span>
                      <span className="flex gap-1.5">
                        {row.colors.map((swatch, index) => (
                          <span
                            key={`${row.key}-${index}`}
                            className="h-5 w-5 rounded-full border border-black/10"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </label>
          ))}
        </fieldset>

        <FormMessage message={state.message} success={state.success} />
        {locked ? null : (
          <SubmitButton idleLabel="Сохранить пресет" pendingLabel="Сохраняю..." />
        )}
      </form>

      <div className="min-w-0 space-y-3 rounded-nested border border-line bg-panel p-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">Как это увидит клиент</p>
          <p className="text-sm leading-6 text-ink-soft">
            Светлую или тёмную пару выбирает телефон клиента, поэтому здесь обе.
          </p>
        </div>

        {/* Ширина по карточке записи: на всю колонку диагональ шла бы
            по пустым полям, а не по содержимому. Подписи стоят у своих
            углов разреза — светлая сверху слева, тёмная снизу справа. */}
        <div className="mx-auto w-full max-w-md space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Светлая
          </p>
          <BookingThemePreviewSplit
            presetId={selectedPresetId}
            serviceTitles={previewServices}
          />
          <p className="text-right text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Тёмная
          </p>
        </div>
      </div>
    </div>
  );
}
