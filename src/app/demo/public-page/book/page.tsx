import Link from "next/link";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatCurrency, type BookingSlot, type Service } from "@/lib/mock-data";
import {
  landingDemoBookingSlotsByService,
  landingDemoPublicPageHref,
  landingDemoServices,
} from "@/lib/landing-demo";

type DemoBookingPageProps = {
  searchParams: Promise<{
    step?: string;
    service?: string;
    date?: string;
    time?: string;
    name?: string;
    phone?: string;
    note?: string;
  }>;
};

const steps = ["Услуга", "Дата и время", "Контакты"];

function clampStep(value?: string) {
  const parsed = Number(value ?? "0");
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.min(Math.max(parsed, 0), steps.length - 1);
}

function getServiceById(services: Service[], serviceId?: string) {
  return services.find((service) => service.id === serviceId) ?? services[0];
}

function getSelectedSlot(
  slots: BookingSlot[],
  dateValue?: string,
  timeValue?: string,
) {
  const selectedDate = slots.find((slot) => slot.value === dateValue) ?? slots[0];
  const selectedTime =
    selectedDate?.times.find((slotTime) => slotTime === timeValue) ?? selectedDate?.times[0] ?? "";

  return {
    selectedDate,
    selectedTime,
  };
}

function buildDemoBookingHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const serialized = query.toString();
  return serialized ? `/demo/public-page/book?${serialized}` : "/demo/public-page/book";
}

export default async function DemoBookingPage({ searchParams }: DemoBookingPageProps) {
  const query = await searchParams;
  const step = clampStep(query.step);
  const selectedService = getServiceById(landingDemoServices, query.service);
  const bookingSlots = landingDemoBookingSlotsByService[selectedService?.id ?? ""] ?? [];
  const { selectedDate, selectedTime } = getSelectedSlot(bookingSlots, query.date, query.time);
  const canContinueFromStepOne = Boolean(selectedService);
  const canContinueFromStepTwo = Boolean(selectedDate?.value && selectedTime);
  const selectedDateLabel = selectedDate?.date ?? "";
  const selectedServiceTitle = selectedService?.title ?? "Услуга";

  const baseParams = {
    service: selectedService?.id,
    date: selectedDate?.value,
    time: selectedTime,
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[var(--color-background)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(184,211,196,0.4),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(247,226,211,0.6),_transparent_30%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-20 mb-6 rounded-full border border-line bg-glass-strong px-4 py-3 shadow-[0_18px_50px_rgba(35,36,31,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <BrandLogo />

            <Link
              href={landingDemoPublicPageHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 py-3 text-sm font-medium text-ink transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <ArrowLeft size={16} />
              Назад
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto w-full max-w-4xl py-6">
          <Card className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted">
                {steps.map((item, index) => (
                  <div key={item} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border text-xs",
                        index <= step
                          ? "border-ink bg-ink text-ink-contrast"
                          : "border-line bg-surface text-muted",
                      )}
                    >
                      {index < step ? <Check size={14} /> : index + 1}
                    </span>
                    <span className="hidden sm:inline">{item}</span>
                  </div>
                ))}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-panel">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${((step + 1) / steps.length) * 100}%` }}
                />
              </div>
            </div>

            {step === 0 ? (
              <div className="grid gap-3">
                {landingDemoServices.map((service) => {
                  const serviceSlots = landingDemoBookingSlotsByService[service.id] ?? [];
                  const firstSlot = serviceSlots[0];
                  const firstTime = firstSlot?.times[0] ?? "";

                  return (
                    <Link
                      key={service.id}
                      href={buildDemoBookingHref({
                        step: "0",
                        service: service.id,
                        date: firstSlot?.value,
                        time: firstTime,
                      })}
                      className={cn(
                        "rounded-[24px] border p-4 text-left transition active:scale-[0.99]",
                        service.id === selectedService?.id
                          ? "border-accent bg-accent-soft"
                          : "border-line bg-surface hover:bg-panel",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="font-medium text-ink">{service.title}</p>
                          <p className="text-sm leading-6 text-muted">{service.description}</p>
                        </div>
                        <div className="text-right text-sm text-ink-soft">
                          <p>{service.durationMinutes} мин</p>
                          <p>{formatCurrency(service.price)}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-ink">
                    Выберите дату
                  </h2>
                  {bookingSlots.length > 0 ? (
                    <>
                      <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar snap-x snap-mandatory sm:hidden">
                        {bookingSlots.map((slot) => {
                          const isSelected = slot.value === selectedDate?.value;
                          const weekdayLabel = slot.date.split(" ")[1] ? slot.date.slice(0, 2) : slot.date;
                          const dayNumber = slot.date.match(/\d+/)?.[0] ?? slot.date;

                          return (
                            <Link
                              key={slot.value}
                              href={buildDemoBookingHref({
                                step: "1",
                                service: selectedService?.id,
                                date: slot.value,
                                time: slot.times[0] ?? "",
                              })}
                              className="snap-start shrink-0 active:scale-[0.99]"
                            >
                              <div
                                className={cn(
                                  "flex min-w-[78px] flex-col items-center rounded-[18px] border px-4 py-3 text-center transition",
                                  isSelected
                                    ? "border-ink bg-ink text-ink-contrast"
                                    : "border-line bg-surface text-ink",
                                )}
                              >
                                <p
                                  className={cn(
                                    "text-[11px] font-medium uppercase tracking-[0.08em]",
                                    isSelected ? "text-ink-contrast" : "text-ink-soft",
                                  )}
                                >
                                  {weekdayLabel}
                                </p>
                                <div className="mt-1 text-[30px] leading-none font-semibold">
                                  {dayNumber}
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>

                      <div className="hidden gap-3 sm:grid sm:grid-cols-4 lg:grid-cols-7">
                        {bookingSlots.map((slot) => {
                          const isSelected = slot.value === selectedDate?.value;

                          return (
                            <Link
                              key={slot.value}
                              href={buildDemoBookingHref({
                                step: "1",
                                service: selectedService?.id,
                                date: slot.value,
                                time: slot.times[0] ?? "",
                              })}
                              className="space-y-3 text-center active:scale-[0.99]"
                            >
                              <p className="text-sm font-medium uppercase text-ink-soft">
                                {slot.date}
                              </p>
                              <div
                                className={cn(
                                  "rounded-2xl border px-4 py-3 text-xl font-medium transition",
                                  isSelected
                                    ? "border-ink bg-ink text-ink-contrast"
                                    : "border-line bg-surface text-ink hover:bg-panel",
                                )}
                              >
                                {slot.date.match(/\d+/)?.[0] ?? slot.date}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-line p-5 text-sm leading-6 text-muted">
                      На ближайшие дни свободного времени пока нет. Попробуй выбрать другую услугу
                      или зайди позже.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-ink">
                    Свободное время
                  </h2>
                  {selectedDate && selectedDate.times.length > 0 ? (
                    <>
                      <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar snap-x snap-mandatory sm:hidden">
                        {selectedDate.times.map((slotTime) => (
                          <Link
                            key={slotTime}
                            href={buildDemoBookingHref({
                              step: "1",
                              service: selectedService?.id,
                              date: selectedDate.value,
                              time: slotTime,
                            })}
                            className={cn(
                              "snap-start shrink-0 rounded-[18px] border px-5 py-3 text-center text-lg font-semibold transition active:scale-[0.99]",
                              slotTime === selectedTime
                                ? "border-ink bg-ink text-ink-contrast"
                                : "border-line bg-surface text-ink",
                            )}
                          >
                            {slotTime}
                          </Link>
                        ))}
                      </div>

                      <div className="hidden grid-cols-2 gap-x-6 gap-y-4 sm:grid sm:grid-cols-3">
                        {selectedDate.times.map((slotTime) => (
                          <Link
                            key={slotTime}
                            href={buildDemoBookingHref({
                              step: "1",
                              service: selectedService?.id,
                              date: selectedDate.value,
                              time: slotTime,
                            })}
                            className={cn(
                              "rounded-[22px] px-4 py-4 text-center text-2xl font-medium transition active:scale-[0.99]",
                              slotTime === selectedTime
                                ? "bg-ink text-ink-contrast"
                                : "bg-transparent text-ink hover:bg-panel",
                            )}
                          >
                            {slotTime}
                          </Link>
                        ))}
                      </div>
                    </>
                  ) : selectedDate ? (
                    <div className="rounded-[24px] border border-dashed border-line p-5 text-sm leading-6 text-muted">
                      На эту дату свободного времени уже нет.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <form action="/demo/public-page/confirm" method="get" className="grid gap-4">
                <input type="hidden" name="service" value={selectedServiceTitle} />
                <input type="hidden" name="date" value={selectedDateLabel} />
                <input type="hidden" name="time" value={selectedTime} />

                <Input
                  name="name"
                  label="Как вас зовут"
                  placeholder="Например, Марина"
                  defaultValue={query.name}
                  required
                />
                <Input
                  name="phone"
                  label="Телефон"
                  placeholder="+7 978 000-00-00"
                  defaultValue={query.phone}
                  hint="Нужен только для подтверждения записи и связи по визиту. Никакого спама."
                  required
                />
                <Textarea
                  name="note"
                  label="Комментарий к записи"
                  placeholder="Например: аллергия на гель, опоздаю на 10 минут, хочу нюд без дизайна"
                  defaultValue={query.note}
                  hint="Поле необязательное, но мастеру правда полезно."
                />

                <div className="rounded-[24px] bg-panel p-4 text-sm text-ink-soft">
                  <p className="font-medium text-ink">Что вы выбрали</p>
                  <p className="mt-2">
                    {selectedServiceTitle} • {selectedDateLabel} • {selectedTime}
                  </p>
                  <p className="mt-3 text-xs leading-6 text-muted">
                    Это демонстрационная запись. На финальном шаге откроется demo-подтверждение
                    без сохранения в базу.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
                  <Link
                    href={buildDemoBookingHref({ ...baseParams, step: "1" })}
                    className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-medium text-ink transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    Назад
                  </Link>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 min-w-56 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-ink-contrast transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    Подтвердить запись
                    <ChevronRight size={16} />
                  </button>
                </div>
              </form>
            ) : (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-3",
                  step === steps.length - 1 ? "justify-center" : "justify-between",
                )}
              >
                <div>
                  {step > 0 ? (
                    <Link
                      href={buildDemoBookingHref({ ...baseParams, step: String(step - 1) })}
                      className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-medium text-ink transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                    >
                      Назад
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-medium text-muted opacity-40">
                      Назад
                    </span>
                  )}
                </div>

                {step === 0 ? (
                  canContinueFromStepOne ? (
                    <Link
                      href={buildDemoBookingHref({ ...baseParams, step: "1" })}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-ink-contrast transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                    >
                      Дальше
                      <ChevronRight size={16} />
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-ink-contrast opacity-40">
                      Дальше
                      <ChevronRight size={16} />
                    </span>
                  )
                ) : step === 1 ? (
                  canContinueFromStepTwo ? (
                    <Link
                      href={buildDemoBookingHref({ ...baseParams, step: "2" })}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-ink-contrast transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                    >
                      Дальше
                      <ChevronRight size={16} />
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-ink-contrast opacity-40">
                      Дальше
                      <ChevronRight size={16} />
                    </span>
                  )
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
