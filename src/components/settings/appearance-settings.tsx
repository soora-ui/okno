"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, Sparkles, X } from "lucide-react";
import { BrandMiniPreview } from "@/components/brand-theme/brand-mini-preview";
import {
  BrandThemeEntry,
  type BrandThemeEntryState,
} from "@/components/settings/brand-theme-entry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBookingThemePreset } from "@/lib/booking-theme-presets";
import type { Profile, Service } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// Раздел «Цвет клиентских страниц». Раньше прямо в узкой колонке настроек
// стояли список пресетов, вытянутый предпросмотр и карточка фирменного
// стиля — три блока, которые теснили друг друга. Теперь в разделе только
// сводка «как сейчас», а выбор живёт в окне «Оформление страницы» с двумя
// вкладками: пресеты (на любом тарифе) и фирменный стиль. Туда же потом
// встанут шаги мастера генерации.

type Tab = "presets" | "brand";

// Список пресетов с разрезанным предпросмотром нужен только в открытом
// окне — грузим его отдельно, а не со всей страницей настроек.
const BookingThemeSettings = dynamic(
  () =>
    import("@/components/settings/booking-theme-settings").then(
      (mod) => mod.BookingThemeSettings,
    ),
  {
    loading: () => (
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="h-[34rem] animate-pulse rounded-nested border border-line bg-panel" />
        <div className="h-[34rem] animate-pulse rounded-nested border border-line bg-panel" />
      </div>
    ),
  },
);

export function AppearanceSettings({
  profile,
  services,
  brand,
}: {
  profile: Profile;
  services: Service[];
  // null — вкладка фирменного стиля скрыта (продакшен до готовности мастера).
  brand: { state: BrandThemeEntryState; generationsLeft: number } | null;
}) {
  const [openTab, setOpenTab] = useState<Tab | null>(null);
  const brandTheme = brand ? profile.brandTheme : null;
  const preset = getBookingThemePreset(profile.bookingThemePresetId);
  const firstName = profile.fullName.split(" ")[0] || profile.fullName;

  return (
    <>
      <div className="flex flex-col gap-5 rounded-nested border border-line bg-surface p-5 sm:flex-row sm:items-center">
        <BrandMiniPreview
          theme={brandTheme}
          presetId={profile.bookingThemePresetId}
          name={firstName}
          className="self-center sm:self-auto"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
              Сейчас на странице
            </span>
            {brandTheme ? <Badge tone="success">Фирменный стиль</Badge> : null}
          </div>
          <p className="text-xl font-semibold text-ink">
            {brandTheme ? "Ваш фирменный стиль" : preset.label}
          </p>
          <p className="text-sm leading-6 text-ink-soft">
            {brandTheme
              ? "Цвета, шрифты и декор бренда на профиле, записи и подтверждении."
              : preset.description}
          </p>
          <span aria-hidden="true" className="flex gap-1.5">
            {(brandTheme
              ? [
                  brandTheme.colors.background,
                  brandTheme.colors.ink,
                  brandTheme.colors.button,
                  brandTheme.colors.decor1,
                ]
              : preset.swatches
            ).map((color, index) => (
              <span
                key={`${color}-${index}`}
                className="h-5 w-5 rounded-full border border-black/10"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button onClick={() => setOpenTab(brandTheme ? "brand" : "presets")}>
              Изменить оформление
            </Button>
            {brand && !brandTheme ? (
              <Button
                variant="ghost"
                className="gap-2"
                onClick={() => setOpenTab("brand")}
              >
                {brand.state === "A" ? (
                  <Lock aria-hidden="true" size={16} strokeWidth={1.6} />
                ) : (
                  <Sparkles aria-hidden="true" size={16} strokeWidth={1.6} />
                )}
                Фирменный стиль
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <AppearanceDialog
        tab={openTab}
        onTabChange={setOpenTab}
        onClose={() => setOpenTab(null)}
        showBrand={brand !== null}
      >
        {openTab === "presets" ? (
          <BookingThemeSettings
            profile={profile}
            services={services}
            locked={brandTheme !== null}
          />
        ) : null}
        {openTab === "brand" && brand ? (
          <BrandThemeEntry
            state={brand.state}
            theme={profile.brandTheme}
            appliedAt={profile.brandThemeAppliedAt}
            subscriptionUntil={profile.subscriptionUntil}
            presetId={profile.bookingThemePresetId}
            masterName={profile.fullName}
            generationsLeft={brand.generationsLeft}
          />
        ) : null}
      </AppearanceDialog>
    </>
  );
}

// Окно на десктопе, шит снизу на телефоне. Порталом в body: карточки
// настроек анимируются и создают свой контекст наложения, внутри которого
// fixed z-50 оказывался под соседними секциями. Закрытие мгновенное, без
// exit-анимации — как у модалки сертификатов.
function AppearanceDialog({
  tab,
  onTabChange,
  onClose,
  showBrand,
  children,
}: {
  tab: Tab | null;
  onTabChange: (tab: Tab) => void;
  onClose: () => void;
  showBrand: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const isOpen = tab !== null;

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "presets", label: "Пресеты" },
    { id: "brand", label: "Фирменный стиль" },
  ];

  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-6 sm:py-8"
      style={{ backgroundColor: "rgba(35,36,31,0.46)", backdropFilter: "blur(6px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appearance-dialog-title"
        className="flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-t-section border border-line bg-surface shadow-ink sm:max-h-[92vh] sm:max-w-[1000px] sm:rounded-section"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-4 border-b border-line px-5 pb-4 pt-3 sm:px-8 sm:pt-6">
          <span aria-hidden="true" className="mx-auto block h-[5px] w-11 rounded-full bg-[var(--color-line)] sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 id="appearance-dialog-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                Оформление страницы
              </h2>
              <p className="text-sm text-ink-soft">
                Профиль, запись и подтверждение. Кабинет не меняется.
              </p>
            </div>
            <Button variant="secondary" onClick={onClose} className="shrink-0 px-3" aria-label="Закрыть">
              <X size={16} />
            </Button>
          </div>
          {showBrand ? (
            <div role="tablist" aria-label="Способ оформления" className="flex gap-1 self-stretch rounded-full border border-line bg-panel p-1 sm:self-start">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "min-h-9 flex-1 whitespace-nowrap rounded-full px-4 text-sm font-medium transition sm:flex-none",
                    tab === item.id
                      ? "bg-[var(--ui-primary-bg)] text-[var(--ui-primary-text)]"
                      : "text-ink-soft hover:text-ink",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:px-8 sm:py-6">
          {children}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
