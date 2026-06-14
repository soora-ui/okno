"use client";

import { useActionState, useState } from "react";
import {
  bookingThemePresets,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";
import { updateBookingThemePresetAction } from "@/app/actions/settings";
import { BookingThemePreview } from "@/components/booking/booking-theme-preview";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import type { Profile, Service } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const initialState = {
  success: false,
  message: "",
};

export function BookingThemeSettings({
  profile,
  services,
}: {
  profile: Profile;
  services: Service[];
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
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <form
        action={action}
        className="space-y-4 rounded-[24px] border border-line bg-surface p-5"
      >
        <input
          type="hidden"
          name="bookingThemePreset"
          value={selectedPresetId}
        />

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">Готовые пресеты</p>
          <p className="text-sm leading-6 text-ink-soft">
            Один пресет применяется ко всему клиентскому пути мастера: профиль,
            запись и экран подтверждения. Кабинет и системные страницы остаются
            без изменений.
          </p>
        </div>

        <div className="grid gap-3">
          {bookingThemePresets.map((preset) => (
            <label
              key={preset.id}
              className={cn(
                "cursor-pointer rounded-[22px] border p-4 transition",
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

              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-ink">{preset.label}</p>
                  <p className="text-sm leading-6 text-muted">
                    {preset.description}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {preset.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="h-5 w-5 rounded-full border border-black/5"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
              </div>
            </label>
          ))}
        </div>

        <FormMessage message={state.message} success={state.success} />
        <SubmitButton idleLabel="Сохранить пресет" pendingLabel="Сохраняю..." />
      </form>

      <div className="space-y-3 rounded-[24px] border border-line bg-[rgba(250,248,244,0.88)] p-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">Как это увидит клиент</p>
          <p className="text-sm leading-6 text-ink-soft">
            В предпросмотре показан основной экран записи. Этот же пресет мягко
            применяется к профилю мастера и экрану подтверждения.
          </p>
        </div>

        <BookingThemePreview
          presetId={selectedPresetId}
          serviceTitles={previewServices}
        />
      </div>
    </div>
  );
}
