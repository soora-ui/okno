"use client";

import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  bookingThemeAttr,
  defaultBookingThemePresetId,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";

type BookingThemePreviewProps = {
  presetId?: BookingThemePresetId;
  serviceTitles?: string[];
  className?: string;
  /**
   * Какую тему показывать. Пресет теперь идёт парой, и мастеру нужно видеть
   * обе: клиент с тёмным телефоном увидит тёмную. Без явного режима
   * предпросмотр повторял бы тему устройства самого мастера.
   */
  mode?: "light" | "dark";
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
  mode,
  className,
}: BookingThemePreviewProps) {
  const previewServices = getPreviewServices(serviceTitles);

  return (
    <div
      {...bookingThemeAttr(presetId)}
      data-booking-theme-mode={mode}
      className={cn("rounded-card border border-line bg-panel p-4", className)}
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
                        : "border-line bg-[var(--ui-field-bg)] text-muted",
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
                  "rounded-nested border p-4",
                  service.selected
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-[var(--ui-field-bg)]",
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
                    "flex min-w-0 flex-1 flex-col items-center rounded-panel border px-2 py-2 text-center",
                    slot.selected
                      ? "border-ink bg-ink text-ink-contrast"
                      : "border-line bg-[var(--ui-field-bg)] text-ink",
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
                    "rounded-panel border px-4 py-2 text-sm font-medium",
                    slot.selected
                      ? "border-ink bg-ink text-ink-contrast"
                      : "border-line bg-[var(--ui-field-bg)] text-ink",
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

/**
 * Один предпросмотр, разрезанный по диагонали из правого верхнего угла
 * в левый нижний: сверху слева светлая тема, снизу справа тёмная.
 *
 * Так пресет виден целиком в обеих темах на одних и тех же элементах — кнопка,
 * выбранный слот и подложка карточки сравниваются напрямую, а не через
 * перевод взгляда между двумя блоками. И места это занимает столько же,
 * сколько один предпросмотр: два рядом попросту не помещались в колонку
 * настроек и вылезали за края.
 */
export function BookingThemePreviewSplit({
  presetId = defaultBookingThemePresetId,
  serviceTitles,
}: Omit<BookingThemePreviewProps, "mode" | "className">) {
  const shared = { presetId, serviceTitles } as const;

  return (
    <div className="relative isolate overflow-hidden rounded-card border border-line">
      {/* Светлая половина идёт в потоке и задаёт высоту всему виджету. */}
      <BookingThemePreview
        {...shared}
        mode="light"
        className="rounded-none border-0"
      />

      {/* Тёмная лежит поверх и обрезана до нижнего правого треугольника.
          aria-hidden: содержимое дублируется, диктору незачем читать его дважды. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
      >
        <BookingThemePreview
          {...shared}
          mode="dark"
          className="h-full rounded-none border-0"
        />
      </div>

      {/* Волосяная линия по самому разрезу. Градиент «to bottom right» даёт
          полосы, параллельные диагонали правый верх — левый низ, то есть
          ровно по краю clip-path выше. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom_right,transparent_calc(50%-1px),var(--color-line)_calc(50%-1px),var(--color-line)_calc(50%+1px),transparent_calc(50%+1px))]"
      />
    </div>
  );
}
