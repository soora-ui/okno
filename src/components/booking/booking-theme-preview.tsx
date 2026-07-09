"use client";

import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  defaultBookingThemePresetId,
  getBookingThemeStyle,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";

type BookingThemePreviewProps = {
  presetId?: BookingThemePresetId;
  serviceTitles?: string[];
};

const previewSteps = ["Услуга", "Дата", "Контакты"];
const previewDates = [
  { weekday: "пн", day: "21", selected: true },
  { weekday: "вт", day: "22", selected: false },
  { weekday: "ср", day: "23", selected: false },
];
const previewTimes = [
  { label: "11:00", selected: false },
  { label: "13:30", selected: true },
  { label: "16:00", selected: false },
];

function getPreviewServices(serviceTitles?: string[]) {
  const titles =
    serviceTitles && serviceTitles.length > 0
      ? serviceTitles
      : ["Маникюр с покрытием", "Коррекция бровей"];

  return [titles[0], titles[1] ?? "Консультация"].map((title, index) => ({
    title,
    meta: index === 0 ? "120 мин · 1 900 ₽" : "45 мин · 900 ₽",
    selected: index === 0,
  }));
}

export function BookingThemePreview({
  presetId = defaultBookingThemePresetId,
  serviceTitles,
}: BookingThemePreviewProps) {
  const previewServices = getPreviewServices(serviceTitles);

  return (
    <div
      style={getBookingThemeStyle(presetId)}
      className="rounded-[28px] border border-line bg-panel p-4"
    >
      <div className="mx-auto max-w-md">
        <Card className="space-y-5 p-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              {previewSteps.map((item, index) => (
                <div key={item} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border text-xs",
                      index === 0
                        ? "border-ink bg-ink text-ink-contrast"
                        : "border-line bg-[var(--ui-field-bg,#ffffff)] text-muted",
                    )}
                  >
                    {index === 0 ? <Check size={14} /> : index + 1}
                  </span>
                  <span className="hidden sm:inline">{item}</span>
                </div>
              ))}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-panel">
              <div className="h-full w-1/3 rounded-full bg-accent" />
            </div>
          </div>

          <div className="grid gap-3">
            {previewServices.map((service) => (
              <div
                key={service.title}
                className={cn(
                  "rounded-[24px] border p-4",
                  service.selected
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-[var(--ui-field-bg,#ffffff)]",
                )}
              >
                <p className="font-medium text-ink">{service.title}</p>
                <p className="mt-1 text-sm text-muted">{service.meta}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              {previewDates.map((slot) => (
                <div
                  key={slot.day}
                  className={cn(
                    "flex min-w-[68px] flex-col items-center rounded-[18px] border px-3 py-2 text-center",
                    slot.selected
                      ? "border-ink bg-ink text-ink-contrast"
                      : "border-line bg-[var(--ui-field-bg,#ffffff)] text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-[0.08em]",
                      slot.selected ? "text-ink-contrast" : "text-ink-soft",
                    )}
                  >
                    {slot.weekday}
                  </span>
                  <span className="mt-1 text-lg font-semibold">{slot.day}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {previewTimes.map((slot) => (
                <div
                  key={slot.label}
                  className={cn(
                    "rounded-[18px] border px-4 py-2 text-sm font-medium",
                    slot.selected
                      ? "border-ink bg-ink text-ink-contrast"
                      : "border-line bg-[var(--ui-field-bg,#ffffff)] text-ink",
                  )}
                >
                  {slot.label}
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full">Продолжить</Button>
        </Card>
      </div>
    </div>
  );
}
