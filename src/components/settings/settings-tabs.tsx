"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  BellRing,
  CalendarRange,
  Globe2,
  LayoutTemplate,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";
import type { AvailabilityRule, Profile, Service } from "@/lib/mock-data";
import type { ServiceManualSummary } from "@/lib/service-manuals";
import { hasActivePro } from "@/lib/subscription";
import { formatPublicProfileLink } from "@/lib/site";
import { Card } from "@/components/ui/card";
import {
  AccessSettingsForm,
  AvailabilitySettingsForm,
  BookingPageSettingsForm,
  BookingPreferencesForm,
  ProfileSettingsForm,
  ServicesSettingsForm,
  SubscriptionSettingsForm,
} from "@/components/forms/settings-forms";
import { ButtonLink } from "@/components/ui/button";

const BookingThemeSettings = dynamic(
  () =>
    import("@/components/settings/booking-theme-settings").then(
      (mod) => mod.BookingThemeSettings,
    ),
  {
    loading: () => (
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="h-[34rem] animate-pulse rounded-[24px] border border-line bg-panel" />
        <div className="h-[34rem] animate-pulse rounded-[24px] border border-line bg-panel" />
      </div>
    ),
  },
);

const tabs = [
  { id: "profile", label: "Профиль" },
  { id: "schedule", label: "Расписание" },
  { id: "services", label: "Услуги" },
  { id: "booking", label: "Запись" },
  { id: "account", label: "Аккаунт" },
] as const;

export function SettingsTabs({
  profile,
  services,
  availabilityRules,
  serviceManuals = {},
}: {
  profile: Profile;
  services: Service[];
  availabilityRules: AvailabilityRule[];
  serviceManuals?: Record<string, ServiceManualSummary>;
}) {
  const [activeTab, setActiveTab] =
    useState<(typeof tabs)[number]["id"]>("profile");

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto border-b border-line">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`touch-manipulation border-b-2 px-4 py-3 text-sm transition active:scale-[0.98] ${
                activeTab === tab.id
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "profile" ? (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <UserRound size={18} className="text-accent-deep" />
              <h2 className="text-xl font-semibold text-ink">О мастере</h2>
            </div>
            <ProfileSettingsForm profile={profile} />
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Globe2 size={18} className="text-warning" />
              <h2 className="text-xl font-semibold text-ink">
                Публичная ссылка
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-panel px-4 py-4">
              <span className="text-sm font-medium text-accent-deep">
                {formatPublicProfileLink(profile.username)}
              </span>
              <ButtonLink href={`/${profile.username}`} variant="secondary" className="min-h-10 px-4 py-2">
                Открыть
              </ButtonLink>
            </div>
            <p className="text-xs text-muted">
              Поделись этой ссылкой, и клиенты смогут записаться без регистрации.
            </p>
          </Card>
        </div>
      ) : null}

      {activeTab === "schedule" ? (
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <CalendarRange size={18} className="text-accent-deep" />
            <h2 className="text-xl font-semibold text-ink">
              Рабочие дни и часы
            </h2>
          </div>
          <AvailabilitySettingsForm availabilityRules={availabilityRules} />
        </Card>
      ) : null}

      {activeTab === "services" ? (
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <Wrench size={18} className="text-warning" />
            <h2 className="text-xl font-semibold text-ink">Услуги</h2>
          </div>
          <ServicesSettingsForm
            services={services}
            manualsByServiceId={serviceManuals}
            hasProAccess={hasActivePro(profile)}
          />
        </Card>
      ) : null}

      {activeTab === "booking" ? (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <SlidersHorizontal size={18} className="text-warning" />
              <h2 className="text-xl font-semibold text-ink">
                Параметры записи
              </h2>
            </div>
            <BookingPreferencesForm profile={profile} />
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <LayoutTemplate size={18} className="text-accent-deep" />
              <h2 className="text-xl font-semibold text-ink">
                Витрина страницы записи
              </h2>
            </div>
            <p className="text-sm leading-6 text-ink-soft">
              Заголовок и подзаголовок помогают клиенту быстрее понять, к кому он
              записывается. Поле комментария можно подстроить под свой процесс.
            </p>
            <BookingPageSettingsForm profile={profile} />
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Palette size={18} className="text-accent-deep" />
              <h2 className="text-xl font-semibold text-ink">
                Цвет клиентских страниц
              </h2>
            </div>
            <BookingThemeSettings profile={profile} services={services} />
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <BellRing size={18} className="text-success" />
              <h2 className="text-xl font-semibold text-ink">
                Telegram-уведомления
              </h2>
            </div>
            <div className="rounded-[18px] bg-panel p-4">
              <p className="text-sm font-medium text-ink">
                {profile.telegramChatId ? "Бот подключен" : "Бот не подключен"}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Подключи Telegram, чтобы получать уведомления о новых записях и будущие
                напоминания о визитах мастера.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "account" ? (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Sparkles size={18} className="text-accent-deep" />
              <h2 className="text-xl font-semibold text-ink">Подписка</h2>
            </div>
            <SubscriptionSettingsForm profile={profile} />
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheck size={18} className="text-ink" />
              <h2 className="text-xl font-semibold text-ink">
                Доступ к аккаунту
              </h2>
            </div>
            <AccessSettingsForm profile={profile} />
          </Card>

          <Card className="space-y-4">
            <h2 className="text-xl font-semibold text-[var(--color-danger, #b14f4f)]">
              Удалить аккаунт
            </h2>
            <p className="text-sm leading-6 text-ink-soft">
              Все данные, записи и клиенты будут удалены без возможности восстановления.
            </p>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-danger-border)] px-5 py-3 text-sm font-medium text-[var(--color-danger)] transition duration-300 hover:bg-[var(--color-danger-soft)]"
            >
              Удалить аккаунт
            </button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
