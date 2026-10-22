"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  LogOut,
  MessageSquare,
  Scissors,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import type { CertificateTemplateSummary } from "@/lib/data";
import type { AvailabilityRule, Profile, Service } from "@/lib/mock-data";
import type { MasterYooKassaAccount } from "@/lib/payments/yookassa-oauth";
import type { AutopayState } from "@/lib/payments/subscription-autopay";
import type { SeatBalance } from "@/lib/subscription-seats";
import type { ReferralInviteSummary } from "@/lib/referral";
import type { ServiceManualSummary } from "@/lib/service-manuals";
import { getPlan } from "@/config/plans";
import {
  formatSubscriptionUntil,
  hasCapability,
  resolveSubscription,
} from "@/lib/subscription";
import { formatPublicProfileLink, publicLinkHost } from "@/lib/site";
import { bookingThemePresets } from "@/lib/booking-theme-presets";
import { Card } from "@/components/ui/card";
import {
  AccessSettingsForm,
  AvailabilitySettingsForm,
  BookingPageSettingsForm,
  BookingPreferencesForm,
  ProfileSettingsForm,
  ServicesSettingsForm,
  SocialLinksSettingsForm,
  SubscriptionSettingsForm,
} from "@/components/forms/settings-forms";
import { ReferralSettings } from "@/components/settings/referral-settings";
import { TelegramConnectSection } from "@/components/settings/telegram-connect-section";
import { YooKassaConnectSection } from "@/components/settings/yookassa-connect-section";
import {
  RecordSectionList,
  SectionStatusMark,
  recordSectionAnchor,
  type RecordSection,
  type SectionStatus,
} from "@/components/settings/record-section-nav";
import {
  SettingsSection,
  SettingsSectionHeading,
} from "@/components/settings/settings-section";
import { getCertificateSectionStatus } from "@/components/settings/certificate-section";
import {
  SettingsSaveBar,
  unsavedQuestion,
  useSettingsSave,
  useUnsavedChangesGuard,
} from "@/components/settings/settings-save-bar";
import { RECORD_TAB_SECTIONS } from "@/config/recordTabSections";
import { isSettingsTabId, type SettingsTabId } from "@/config/settingsTabs";
import { cn, pluralizeRu } from "@/lib/utils";

const BookingThemeSettings = dynamic(
  () =>
    import("@/components/settings/booking-theme-settings").then(
      (mod) => mod.BookingThemeSettings,
    ),
  {
    loading: () => (
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="h-[34rem] animate-pulse rounded-nested border border-line bg-panel" />
        <div className="h-[34rem] animate-pulse rounded-nested border border-line bg-panel" />
      </div>
    ),
  },
);

// Leaflet работает только в браузере и весит заметно — грузим пикер отдельно.
const MapLocationPicker = dynamic(
  () =>
    import("@/components/settings/map-location-picker").then(
      (mod) => mod.MapLocationPicker,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[360px] animate-pulse rounded-nested border border-line bg-panel" />
    ),
  },
);

const PortfolioWorksSection = dynamic(
  () =>
    import("@/components/settings/profile-media-upload-section").then(
      (mod) => mod.PortfolioWorksSection,
    ),
  {
    loading: () => (
      <div className="h-40 animate-pulse rounded-nested border border-line bg-panel" />
    ),
  },
);

const CertificateSection = dynamic(
  () =>
    import("@/components/settings/certificate-section").then(
      (mod) => mod.CertificateSection,
    ),
  {
    loading: () => (
      <div className="h-[26rem] animate-pulse rounded-nested border border-line bg-panel" />
    ),
  },
);

const tabs: {
  id: SettingsTabId;
  label: string;
  hint: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "profile",
    label: "Профиль",
    hint: "Имя, фото, адрес",
    description: "Так клиенты видят тебя на странице записи.",
    icon: UserRound,
  },
  {
    id: "schedule",
    label: "Расписание",
    hint: "Рабочие дни и часы",
    description: "Свободное время на странице записи считается от этих часов.",
    icon: CalendarDays,
  },
  {
    id: "services",
    label: "Услуги",
    hint: "Цены, длительность, предоплата",
    description:
      "Что клиент может выбрать при записи, сколько это стоит и длится.",
    icon: Scissors,
  },
  {
    id: "booking",
    label: "Запись",
    hint: "Правила, витрина, уведомления",
    description:
      "Как клиенты записываются, что видят на странице и когда приходят напоминания.",
    icon: SlidersHorizontal,
  },
  {
    id: "account",
    label: "Аккаунт",
    hint: "Вход, подписка, приглашения",
    description: "Тариф, доступ к аккаунту и приглашения коллег.",
    icon: ShieldCheck,
  },
];

// Шапка липкая (top-4 + её высота), под ней держатся боковые колонки.
const stickyTop = "lg:top-28";
const mobileQuery = "(max-width: 1023.98px)";

export function SettingsTabs({
  profile,
  services,
  availabilityRules,
  serviceManuals = {},
  referralInvites = [],
  certificateTemplate = null,
  yookassaAccount = null,
  activeSeats = 0,
  autopay,
  seatBalance,
  initialTab = null,
  notices,
}: {
  profile: Profile;
  services: Service[];
  availabilityRules: AvailabilityRule[];
  serviceManuals?: Record<string, ServiceManualSummary>;
  referralInvites?: ReferralInviteSummary[];
  certificateTemplate?: CertificateTemplateSummary | null;
  yookassaAccount?: MasterYooKassaAccount | null;
  // Активные сотрудники рабочего пространства — от них считается доплата
  // за места сверх включённых в тариф.
  activeSeats?: number;
  autopay?: AutopayState;
  seatBalance?: SeatBalance;
  /** Вкладка из ?tab= — по ней открываются ссылки из уведомлений и ЮKassa. */
  initialTab?: SettingsTabId | null;
  notices?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(
    initialTab ?? "profile",
  );
  // На телефоне настройки — это список разделов, а раздел открывается
  // отдельным экраном поверх него. На широком экране список всегда слева.
  const [mobileView, setMobileView] = useState<"hub" | "section">(
    initialTab ? "section" : "hub",
  );
  const [activeRecordId, setActiveRecordId] = useState<string>(
    RECORD_TAB_SECTIONS[0].id,
  );
  // Открыли раздел из списка на телефоне — в истории есть шаг, и «назад»
  // (кнопкой или жестом) возвращает к списку, а не уводит из настроек.
  const pushedSection = useRef(false);

  // Карточки раздела сохраняются одной кнопкой внизу. «Отменить»
  // перемонтирует их — так в исходное состояние возвращается и то, что
  // живёт в state компонентов, а не только в полях.
  const panelRef = useRef<HTMLDivElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const {
    dirty,
    status: saveStatus,
    save,
    afterDiscard,
  } = useSettingsSave(panelRef);
  useUnsavedChangesGuard(dirty);
  const discardChanges = () => {
    setResetKey((key) => key + 1);
    afterDiscard();
  };

  const canTakePrepayment = hasCapability(profile, "prepayment");
  const readiness = getPageReadiness(profile, services);

  useEffect(() => {
    const onPopState = () => {
      const tab = new URL(window.location.href).searchParams.get("tab");
      pushedSection.current = false;
      if (isSettingsTabId(tab)) {
        setActiveTab(tab);
        setMobileView("section");
      } else {
        setMobileView("hub");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const writeTabToUrl = (tab: SettingsTabId | null, push: boolean) => {
    const url = new URL(window.location.href);
    if (tab) url.searchParams.set("tab", tab);
    else url.searchParams.delete("tab");
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };

  const selectTab = useCallback(
    (tab: SettingsTabId, anchorId?: string) => {
      // Другой раздел размонтирует карточки текущего вместе с правками.
      if (tab !== activeTab && dirty && !window.confirm(unsavedQuestion))
        return;
      const fromMobileHub =
        mobileView === "hub" && window.matchMedia(mobileQuery).matches;
      writeTabToUrl(tab, fromMobileHub);
      if (fromMobileHub) pushedSection.current = true;
      setActiveTab(tab);
      setMobileView("section");

      // Ждём, пока раздел отрисуется, и листаем к нужной карточке или наверх.
      window.requestAnimationFrame(() => {
        const target = anchorId ? document.getElementById(anchorId) : null;
        if (target) {
          target.scrollIntoView({
            behavior: prefersReducedMotion() ? "auto" : "smooth",
            block: "start",
          });
        } else {
          window.scrollTo({ top: 0 });
        }
      });
    },
    [mobileView, activeTab, dirty],
  );

  const goToHub = () => {
    if (pushedSection.current) {
      window.history.back();
      return;
    }
    writeTabToUrl(null, false);
    setMobileView("hub");
    window.scrollTo({ top: 0 });
  };

  const scrollToRecord = (id: string) => {
    setActiveRecordId(id);
    document
      .getElementById(recordSectionAnchor(id))
      ?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
  };

  // Подсвечиваем в навигации подраздел «Записи», который сейчас под шапкой.
  useEffect(() => {
    if (activeTab !== "booking") return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (window.matchMedia(mobileQuery).matches) return;
      let current = RECORD_TAB_SECTIONS[0].id;
      for (const section of RECORD_TAB_SECTIONS) {
        const el = document.getElementById(recordSectionAnchor(section.id));
        if (el && el.getBoundingClientRect().top <= 160) current = section.id;
      }
      // У нижнего края страницы последний подраздел может так и не доехать до
      // шапки — тогда отмечаем его, иначе до него не дотянуться подсветкой.
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        current = RECORD_TAB_SECTIONS[RECORD_TAB_SECTIONS.length - 1].id;
      }
      setActiveRecordId(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeTab]);

  const recordSectionContent: Record<string, React.ReactNode> = {
    "booking-params": (
      <Card className="space-y-5 p-5 sm:p-6">
        <SettingsSectionHeading
          title="Параметры записи"
          description="Работают для всех услуг сразу."
        />
        <BookingPreferencesForm profile={profile} />
      </Card>
    ),
    "booking-page": (
      <Card className="space-y-5 p-5 sm:p-6">
        <SettingsSectionHeading
          title="Витрина страницы записи"
          description="Первое, что клиент читает, когда открывает твою ссылку. Поле комментария можно подстроить под свой процесс."
        />
        <BookingPageSettingsForm profile={profile} />
      </Card>
    ),
    certificates: (
      <CertificateSection
        profile={profile}
        certificateTemplate={certificateTemplate}
        yookassaConnected={yookassaAccount?.status === "enabled"}
      />
    ),
    telegram: <TelegramConnectSection profile={profile} />,
    "color-palette": (
      <Card className="space-y-5 p-5 sm:p-6">
        <SettingsSectionHeading
          title="Цвет клиентских страниц"
          description="Профиль, запись и подтверждение. Светлую или тёмную пару выбирает телефон клиента."
        />
        <BookingThemeSettings profile={profile} services={services} />
      </Card>
    ),
  };

  const recordSectionStatus: Record<string, SectionStatus> = {
    "booking-params": "none",
    "booking-page": "none",
    certificates: getCertificateSectionStatus(profile, certificateTemplate),
    telegram: profile.telegramChatId ? "complete" : "none",
    "color-palette": "none",
  };

  const recordTabSections: RecordSection[] = RECORD_TAB_SECTIONS.map(
    (section) => ({
      id: section.id,
      label: section.label,
      hint: section.hint,
      icon: section.icon,
      status: recordSectionStatus[section.id],
      content: recordSectionContent[section.id],
    }),
  );

  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const asideContent =
    activeTab === "booking" ? (
      <BookingPreviewCard profile={profile} />
    ) : (
      <>
        <PublicLinkCard profile={profile} />
        <ReadinessCard readiness={readiness} onNavigate={selectTab} />
      </>
    );

  return (
    <div className="space-y-6">
      {/* Заголовок страницы. На телефоне внутри раздела его заменяет строка
          «назад» — там важнее, где ты сейчас, чем общее «Настройки». */}
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-4 pt-2",
          mobileView === "section" && "max-lg:hidden",
        )}
      >
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent-deep">
            Кабинет мастера
          </p>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-ink lg:text-4xl">
            Настройки
          </h1>
          <p className="max-w-xl text-[15px] leading-6 text-ink-soft max-lg:hidden">
            Профиль, расписание, услуги и правила записи — всё, что видят
            клиенты и как они к тебе попадают.
          </p>
        </div>
        <Link
          href="/knowledge"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(35,36,31,0.06),0_6px_16px_rgba(35,36,31,0.06)] transition duration-300 hover:-translate-y-0.5 max-lg:hidden"
        >
          <BookOpen size={16} aria-hidden="true" />
          Как всё настроить
        </Link>
      </div>

      {notices}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start xl:grid-cols-[264px_minmax(0,1fr)_300px]">
        {/* Навигация по разделам: на широком экране держится на месте при
            прокрутке, длинный список «Записи» прокручивается внутри. */}
        <div className={cn("hidden lg:sticky lg:block", stickyTop)}>
          <nav
            aria-label="Разделы настроек"
            data-tour="settings-tabs"
            className="flex max-h-[calc(100dvh-8rem)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-3 shadow-card [scrollbar-width:thin]"
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const link = (
                <SettingsNavButton
                  tab={tab}
                  isActive={isActive}
                  nested={isActive && tab.id === "booking"}
                  onSelect={() => selectTab(tab.id)}
                />
              );
              if (!(isActive && tab.id === "booking")) {
                return <div key={tab.id}>{link}</div>;
              }
              return (
                <div
                  key={tab.id}
                  className="flex flex-col gap-1 rounded-nested border border-accent bg-accent-soft p-1"
                >
                  {link}
                  <ul className="mb-1 flex flex-col gap-0.5 pl-5">
                    {recordTabSections.map((section) => {
                      const isCurrent = section.id === activeRecordId;
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            data-tour-section={section.id}
                            data-active={isCurrent || undefined}
                            aria-current={isCurrent ? "location" : undefined}
                            onClick={() => scrollToRecord(section.id)}
                            className={cn(
                              "flex min-h-10 w-full items-center gap-2.5 rounded-full border px-3 text-left text-sm font-medium transition",
                              isCurrent
                                ? "border-accent bg-surface text-ink"
                                : "border-transparent text-ink-soft hover:text-[var(--color-ink)]",
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                isCurrent
                                  ? "bg-[var(--color-accent-deep)]"
                                  : "bg-[var(--color-line)]",
                              )}
                            />
                            <span className="flex-1">
                              {shortRecordLabel(section.label)}
                            </span>
                            <SectionStatusMark status={section.status} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            <div
              aria-hidden="true"
              className="mx-3 my-2 h-px bg-[var(--color-line)]"
            />

            <Link
              href="/feedback"
              className="flex min-h-11 items-center gap-3 rounded-panel px-3 text-sm font-medium text-ink-soft transition hover:text-[var(--color-ink)]"
            >
              <MessageSquare size={18} aria-hidden="true" />
              Идеи и проблемы
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex min-h-11 w-full items-center gap-3 rounded-panel px-3 text-left text-sm font-medium text-[var(--color-danger)] transition hover:bg-[var(--color-danger-soft)]"
              >
                <LogOut size={18} aria-hidden="true" />
                Выйти из аккаунта
              </button>
            </form>
          </nav>
        </div>

        {/* Телефон: список разделов. */}
        <div
          className={cn(
            "flex flex-col gap-4 lg:hidden",
            mobileView === "section" && "hidden",
          )}
        >
          <MobileProfileCard profile={profile} />

          <nav
            aria-label="Разделы настроек"
            data-tour="settings-tabs"
            className="flex flex-col rounded-card border border-line bg-surface p-1.5 shadow-card"
          >
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              return (
                <div key={tab.id}>
                  {index > 0 ? (
                    <div
                      aria-hidden="true"
                      className="ml-16 mr-3 h-px bg-panel"
                    />
                  ) : null}
                  <button
                    type="button"
                    data-tour-tab={tab.id}
                    onClick={() => selectTab(tab.id)}
                    className="flex min-h-[72px] w-full items-center gap-3 rounded-[22px] px-3 text-left transition active:bg-[var(--color-panel)]"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-panel text-ink"
                    >
                      <Icon size={20} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-ink">
                        {tab.label}
                      </span>
                      <span className="truncate text-[13px] text-muted">
                        {mobileHint(tab.id, {
                          profile,
                          services,
                          availabilityRules,
                        })}
                      </span>
                    </span>
                    <MobileTabBadge
                      tab={tab.id}
                      readiness={readiness}
                      telegramConnected={Boolean(profile.telegramChatId)}
                    />
                    <ChevronRight
                      size={18}
                      aria-hidden="true"
                      className="shrink-0 text-muted"
                    />
                  </button>
                </div>
              );
            })}
          </nav>

          <div className="flex flex-col rounded-card border border-line bg-surface p-1.5">
            <Link
              href="/knowledge"
              className="flex min-h-14 items-center gap-3 rounded-[22px] px-3.5 text-[15px] font-medium text-ink"
            >
              <BookOpen
                size={18}
                aria-hidden="true"
                className="text-ink-soft"
              />
              <span className="flex-1">Как всё настроить</span>
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="text-muted"
              />
            </Link>
            <div aria-hidden="true" className="ml-12 mr-3.5 h-px bg-panel" />
            <Link
              href="/feedback"
              className="flex min-h-14 items-center gap-3 rounded-[22px] px-3.5 text-[15px] font-medium text-ink"
            >
              <MessageSquare
                size={18}
                aria-hidden="true"
                className="text-ink-soft"
              />
              <span className="flex-1">Идеи и проблемы</span>
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="text-muted"
              />
            </Link>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[15px] font-medium text-[var(--color-danger)]"
            >
              <LogOut size={18} aria-hidden="true" />
              Выйти из аккаунта
            </button>
          </form>
        </div>

        {/* Содержимое раздела. */}
        <div
          ref={panelRef}
          data-tour-panel={activeTab}
          className={cn(
            "flex min-w-0 flex-col gap-6",
            // Свои кнопки «Сохранить» у карточек заменяет общая панель.
            "[&_form[data-settings-form]_[data-submit]]:hidden",
            mobileView === "hub" && "max-lg:hidden",
          )}
        >
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              data-tour="settings-back"
              aria-label="Назад к настройкам"
              onClick={goToHub}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-[0_1px_2px_rgba(35,36,31,0.06),0_6px_16px_rgba(35,36,31,0.06)]"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-muted">Настройки</p>
              <h2 className="text-xl font-semibold leading-tight text-ink">
                {active.label}
              </h2>
            </div>
          </div>

          <div className="space-y-2 max-lg:hidden">
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.025em] text-ink">
              {active.label}
            </h2>
            <p className="text-[15px] leading-6 text-ink-soft">
              {active.description}
            </p>
          </div>

          <Fragment key={resetKey}>
            {activeTab === "profile" ? (
              <>
                <SettingsSection id="profile-about" title="О мастере">
                  <ProfileSettingsForm profile={profile} />
                </SettingsSection>

                <SettingsSection
                  id="profile-works"
                  title="Готовые работы"
                  description="Отдельный блок на странице записи — клиент откроет галерею и пролистает все работы."
                >
                  <PortfolioWorksSection profile={profile} />
                </SettingsSection>

                <SettingsSection
                  id="profile-social"
                  title="Соцсети"
                  description="Иконки появятся в блоке о тебе на странице записи — клиент сможет посмотреть твои работы и написать напрямую."
                >
                  <SocialLinksSettingsForm profile={profile} />
                </SettingsSection>

                <SettingsSection
                  id="profile-map"
                  title="Место на карте"
                  description="Отметь, где проходит приём. Карта с кнопкой «Построить маршрут» появится в самом конце страницы записи."
                >
                  <MapLocationPicker
                    initialLocation={profile.bookingPageSettings.mapLocation}
                    city={profile.locationText}
                    address={profile.address}
                  />
                </SettingsSection>
              </>
            ) : null}

            {activeTab === "schedule" ? (
              <SettingsSection
                title="Рабочие дни и часы"
                description="Клиенты видят свободное время только внутри этих часов."
              >
                <AvailabilitySettingsForm
                  availabilityRules={availabilityRules}
                />
              </SettingsSection>
            ) : null}

            {activeTab === "services" ? (
              <>
                {canTakePrepayment ? (
                  <YooKassaConnectSection account={yookassaAccount} />
                ) : (
                  <SettingsSection
                    title="Приём предоплаты"
                    description="Предоплата входит в тарифы «Соло. Расширенный» и «Студия и барбершоп». Подключить их можно в разделе «Аккаунт»."
                  >
                    <button
                      type="button"
                      onClick={() => selectTab("account")}
                      className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition hover:-translate-y-0.5"
                    >
                      Выбрать тариф
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </SettingsSection>
                )}

                <SettingsSection title="Услуги">
                  <ServicesSettingsForm
                    services={services}
                    manualsByServiceId={serviceManuals}
                    hasProAccess={hasCapability(profile, "aiConsultation")}
                    isYooKassaConnected={
                      canTakePrepayment && yookassaAccount?.status === "enabled"
                    }
                  />
                </SettingsSection>
              </>
            ) : null}

            {activeTab === "booking" ? (
              <>
                <RecordSectionList sections={recordTabSections} />
                <a
                  href={`/${profile.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-surface text-[15px] font-medium text-ink lg:hidden"
                >
                  Посмотреть страницу записи
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </>
            ) : null}

            {activeTab === "account" ? (
              <>
                <SettingsSection title="Подписка">
                  {profile.accountRole === "staff" ? (
                    <StaffSubscriptionNote profile={profile} />
                  ) : (
                    <SubscriptionSettingsForm
                      profile={profile}
                      activeSeats={activeSeats}
                      autopay={autopay}
                      seatBalance={seatBalance}
                    />
                  )}
                </SettingsSection>

                <SettingsSection title="Реферальная программа">
                  <ReferralSettings
                    referralCode={profile.referralCode}
                    referralLink={
                      profile.referralCode
                        ? `${publicLinkHost}/register?ref=${profile.referralCode}`
                        : null
                    }
                    invites={referralInvites}
                  />
                </SettingsSection>

                <SettingsSection
                  title="Доступ к аккаунту"
                  description="Email и пароль для входа в кабинет."
                >
                  <AccessSettingsForm profile={profile} />
                </SettingsSection>

                <SettingsSection
                  title="Удалить аккаунт"
                  description="Все данные, записи и клиенты будут удалены без возможности восстановления."
                >
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center self-start rounded-full border border-[var(--color-danger-border)] px-5 py-3 text-sm font-medium text-[var(--color-danger)] transition duration-300 hover:bg-[var(--color-danger-soft)]"
                  >
                    Удалить аккаунт
                  </button>
                </SettingsSection>
              </>
            ) : null}
          </Fragment>

          {/* Между планшетом и широким экраном правой колонке не хватает
              места — её карточки уходят в конец раздела. */}
          <div className="hidden flex-col gap-6 lg:flex xl:hidden">
            {asideContent}
          </div>

          <SettingsSaveBar
            dirty={dirty}
            status={saveStatus}
            onSave={save}
            onDiscard={discardChanges}
          />
        </div>

        <aside
          aria-label={
            activeTab === "booking"
              ? "Предпросмотр страницы записи"
              : "Твоя страница записи"
          }
          className={cn("hidden flex-col gap-6 xl:sticky xl:flex", "xl:top-28")}
        >
          {asideContent}
        </aside>
      </div>
    </div>
  );
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// В узкой навигации полные названия подразделов не помещаются.
function shortRecordLabel(label: string) {
  return (
    {
      "Витрина страницы записи": "Витрина страницы",
      "Подарочные сертификаты": "Сертификаты",
      "Telegram-уведомления": "Telegram",
      "Цвет клиентских страниц": "Цвет страниц",
    }[label] ?? label
  );
}

function SettingsNavButton({
  tab,
  isActive,
  nested,
  onSelect,
}: {
  tab: (typeof tabs)[number];
  isActive: boolean;
  nested: boolean;
  onSelect: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      data-tour-tab={tab.id}
      data-active={isActive || undefined}
      aria-current={isActive ? "page" : undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-panel border text-left text-ink transition",
        nested ? "border-transparent p-2" : "p-3",
        isActive && !nested
          ? "border-accent bg-accent-soft"
          : !nested && "border-transparent hover:bg-[var(--color-panel)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          isActive ? "bg-accent" : "bg-panel",
        )}
      >
        <Icon size={20} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-[15px]",
            isActive ? "font-semibold" : "font-medium",
          )}
        >
          {tab.label}
        </span>
        <span className="text-xs leading-4 text-muted">{tab.hint}</span>
      </span>
    </button>
  );
}

type Readiness = {
  done: number;
  total: number;
  items: {
    id: string;
    label: string;
    done: boolean;
    tab: SettingsTabId;
    anchorId?: string;
  }[];
};

// Что нужно, чтобы страница записи выглядела законченной. Счёт честный:
// только то, что клиент действительно увидит.
function getPageReadiness(profile: Profile, services: Service[]): Readiness {
  const items: Readiness["items"] = [
    {
      id: "photo",
      label: "Фото и имя",
      done: Boolean(profile.avatarPath) && Boolean(profile.fullName.trim()),
      tab: "profile",
      anchorId: "profile-about",
    },
    {
      id: "bio",
      label: "О себе",
      done: Boolean(profile.bio.trim()),
      tab: "profile",
      anchorId: "profile-about",
    },
    {
      id: "place",
      label: "Адрес и карта",
      done:
        Boolean(profile.address.trim()) &&
        Boolean(profile.bookingPageSettings.mapLocation),
      tab: "profile",
      anchorId: "profile-map",
    },
    {
      id: "services",
      label: "Услуги",
      done: services.some((service) => service.isActive),
      tab: "services",
    },
    {
      id: "social",
      label: "Соцсети",
      done: Object.values(profile.bookingPageSettings.socialLinks).some(
        Boolean,
      ),
      tab: "profile",
      anchorId: "profile-social",
    },
  ];

  return {
    done: items.filter((item) => item.done).length,
    total: items.length,
    items,
  };
}

const softShadow =
  "shadow-[0_1px_2px_rgba(35,36,31,0.06),0_6px_16px_rgba(35,36,31,0.06)]";

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return { copied, copy };
}

function CopyLinkButton({ url }: { url: string }) {
  const { copied, copy } = useCopy(url);
  return (
    <>
      <button
        type="button"
        aria-label={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        onClick={() => void copy()}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition active:scale-95",
          softShadow,
        )}
      >
        {copied ? (
          <Check size={18} aria-hidden="true" />
        ) : (
          <Copy size={18} aria-hidden="true" />
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Ссылка скопирована" : ""}
      </span>
    </>
  );
}

function PublicLinkCard({ profile }: { profile: Profile }) {
  const link = formatPublicProfileLink(profile.username);

  return (
    <section
      data-tour="public-link"
      aria-labelledby="public-link-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card"
    >
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent-deep">
          Твоя страница
        </p>
        <h3
          id="public-link-title"
          className="text-xl font-semibold leading-tight text-ink"
        >
          Ссылка для клиентов
        </h3>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-field bg-panel py-1 pl-3.5 pr-1">
        <span className="truncate text-sm font-medium text-ink">{link}</span>
        <CopyLinkButton url={`https://${link}`} />
      </div>
      <a
        href={`/${profile.username}`}
        target="_blank"
        rel="noreferrer"
        style={{
          backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
          color: "var(--ui-primary-text)",
        }}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-medium transition hover:-translate-y-0.5"
      >
        Открыть страницу
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
      <p className="text-xs leading-5 text-muted">
        Поделись ссылкой — клиенты запишутся без регистрации.
      </p>
    </section>
  );
}

function ReadinessCard({
  readiness,
  onNavigate,
}: {
  readiness: Readiness;
  onNavigate: (tab: SettingsTabId, anchorId?: string) => void;
}) {
  const percent = Math.round((readiness.done / readiness.total) * 100);
  const complete = readiness.done === readiness.total;

  return (
    <section
      aria-labelledby="readiness-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3
          id="readiness-title"
          className="text-xl font-semibold leading-tight text-ink"
        >
          {complete ? "Страница готова" : "Готовность страницы"}
        </h3>
        <span className="text-sm font-medium text-accent-deep">
          {readiness.done} из {readiness.total}
        </span>
      </div>
      <div
        role="img"
        aria-label={`Заполнено ${readiness.done} из ${readiness.total}`}
        className="h-2 overflow-hidden rounded-full bg-panel"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="flex flex-col gap-1">
        {readiness.items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex min-h-9 items-center gap-3 text-sm",
              item.done ? "text-ink-soft" : "font-medium text-ink",
            )}
          >
            {item.done ? (
              <span
                aria-hidden="true"
                className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep"
              >
                <Check size={14} strokeWidth={2.4} />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="size-[22px] shrink-0 rounded-full border border-line"
              />
            )}
            <span className="flex-1">{item.label}</span>
            {item.done ? (
              <span className="sr-only">готово</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(item.tab, item.anchorId)}
                className="text-[13px] font-medium text-accent-deep hover:underline"
              >
                Добавить
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// «Разрезанный» предпросмотр: левый верхний угол — страница в светлой теме
// телефона клиента, правый нижний — в тёмной. Цвета берутся из выбранного
// пресета, так что карточка показывает именно то, что увидит клиент.
function BookingPreviewCard({ profile }: { profile: Profile }) {
  const preset =
    bookingThemePresets.find(
      (item) => item.id === profile.bookingThemePresetId,
    ) ?? bookingThemePresets[0];
  const headline =
    profile.bookingPageSettings.headline.trim() ||
    profile.specialty ||
    "Онлайн-запись";

  return (
    <section
      aria-labelledby="booking-preview-title"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card"
    >
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent-deep">
          Предпросмотр
        </p>
        <h3
          id="booking-preview-title"
          className="text-xl font-semibold leading-tight text-ink"
        >
          Так увидит клиент
        </h3>
      </div>

      <div className="relative overflow-hidden rounded-nested border border-line">
        <PreviewFace
          vars={preset.light}
          profile={profile}
          headline={headline}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        >
          <PreviewFace
            vars={preset.dark}
            profile={profile}
            headline={headline}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom right, transparent calc(50% - 0.5px), var(--color-line) calc(50% - 0.5px), var(--color-line) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
          }}
        />
      </div>
      <p className="text-xs leading-5 text-muted">
        Слева сверху — светлая тема телефона клиента, справа снизу — тёмная.
        Тема: «{preset.label}».
      </p>
      <a
        href={`/${profile.username}`}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface text-sm font-medium text-ink transition hover:-translate-y-0.5",
          softShadow,
        )}
      >
        Открыть страницу
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}

function PreviewFace({
  vars,
  profile,
  headline,
}: {
  vars: Record<string, string>;
  profile: Profile;
  headline: string;
}) {
  const times = ["10:00", "12:30", "15:00"];
  return (
    <div
      className="flex h-full flex-col gap-3.5 p-5"
      style={{
        backgroundColor: vars["--color-background"],
        color: vars["--color-ink"],
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="size-9 shrink-0 rounded-full"
          style={{ backgroundColor: vars["--color-panel"] }}
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">
            {profile.fullName}
          </span>
          <span
            className="truncate text-xs"
            style={{ color: vars["--color-muted"] }}
          >
            {profile.specialty}
          </span>
        </span>
      </div>
      <p className="line-clamp-2 text-[17px] font-semibold leading-tight tracking-[-0.02em]">
        {headline}
      </p>
      <div
        className="flex flex-col gap-2.5 rounded-panel border p-3"
        style={{
          backgroundColor: vars["--ui-card-bg"],
          borderColor: vars["--color-line"],
        }}
      >
        <span className="text-xs font-medium">Завтра</span>
        <div className="flex flex-wrap gap-1.5">
          {times.map((time, index) => (
            <span
              key={time}
              className="rounded-full border px-2.5 py-1.5 text-xs"
              style={
                index === 1
                  ? {
                      backgroundColor: vars["--color-accent"],
                      borderColor: vars["--color-accent"],
                    }
                  : { borderColor: vars["--color-line"] }
              }
            >
              {time}
            </span>
          ))}
        </div>
      </div>
      <span
        className="flex h-10 items-center justify-center rounded-full text-[13px] font-medium"
        style={{
          backgroundColor: vars["--ui-primary-bg"],
          color: vars["--ui-primary-text"],
        }}
      >
        Записаться
      </span>
    </div>
  );
}

function MobileProfileCard({ profile }: { profile: Profile }) {
  const link = formatPublicProfileLink(profile.username);
  const url = `https://${link}`;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: profile.fullName, url });
        return;
      } catch {
        // Отмена шеринга — не ошибка.
        return;
      }
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
  };

  return (
    <section
      aria-label="Твоя страница"
      data-tour="public-link"
      className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-center gap-3">
        <Image
          src={profile.avatarUrl}
          alt=""
          width={112}
          height={112}
          sizes="56px"
          className="size-14 shrink-0 rounded-full border border-line bg-panel object-cover"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[17px] font-semibold text-ink">
            {profile.fullName}
          </span>
          <span className="truncate text-[13px] text-muted">
            {[profile.specialty, profile.locationText]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-panel bg-panel py-1 pl-3.5 pr-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {link}
        </span>
        <CopyLinkButton url={url} />
        <button
          type="button"
          aria-label="Поделиться ссылкой"
          onClick={() => void share()}
          style={{
            backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
            color: "var(--ui-primary-text)",
          }}
          className="flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
        >
          <Share2 size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function MobileTabBadge({
  tab,
  readiness,
  telegramConnected,
}: {
  tab: SettingsTabId;
  readiness: Readiness;
  telegramConnected: boolean;
}) {
  if (tab === "profile") {
    return (
      <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-deep">
        {readiness.done} из {readiness.total}
      </span>
    );
  }
  if (tab === "booking" && !telegramConnected) {
    return (
      <span
        role="img"
        aria-label="Есть что настроить"
        className="size-2 shrink-0 rounded-full bg-[var(--color-warning)]"
      />
    );
  }
  return null;
}

const shortWeekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// Подпись под «Расписанием» в мобильном списке: дни и часы одной строкой.
function scheduleSummary(rules: AvailabilityRule[]) {
  const active = rules
    .filter((rule) => rule.isActive)
    .sort((a, b) => a.weekday - b.weekday);
  if (active.length === 0) return "Рабочие дни не выбраны";

  const days = active.map((rule) => rule.weekday);
  const isRun = days.every(
    (day, index) => index === 0 || day === days[index - 1] + 1,
  );
  const dayLabel =
    isRun && days.length > 2
      ? `${shortWeekdays[days[0] - 1]}–${shortWeekdays[days[days.length - 1] - 1]}`
      : days.map((day) => shortWeekdays[day - 1]).join(", ");

  const sameHours = active.every(
    (rule) =>
      rule.startTime === active[0].startTime &&
      rule.endTime === active[0].endTime,
  );
  const hours = sameHours
    ? `${active[0].startTime.slice(0, 5)}–${active[0].endTime.slice(0, 5)}`
    : "разное время";

  return `${dayLabel}, ${hours}`;
}

function mobileHint(
  tab: SettingsTabId,
  {
    profile,
    services,
    availabilityRules,
  }: {
    profile: Profile;
    services: Service[];
    availabilityRules: AvailabilityRule[];
  },
) {
  if (tab === "profile") return "Имя, фото, адрес, соцсети";
  if (tab === "schedule") return scheduleSummary(availabilityRules);
  if (tab === "services") {
    const count = services.filter((service) => service.isActive).length;
    return count > 0
      ? `${pluralizeRu(count, "услуга", "услуги", "услуг")} · цены и предоплата`
      : "Цены, длительность, предоплата";
  }
  if (tab === "booking") return "Правила, витрина, Telegram, цвет";

  const access = resolveSubscription(profile);
  const plan = access.isTrial
    ? "Пробный период"
    : access.planId
      ? getPlan(access.planId).title
      : "Без тарифа";
  return `${plan} · вход и пароль`;
}

// Тариф студии оплачивает администратор: сотруднику — только статус доступа.
function StaffSubscriptionNote({ profile }: { profile: Profile }) {
  const access = resolveSubscription(profile);
  const plan = access.planId ? getPlan(access.planId) : null;
  const until = formatSubscriptionUntil(access.activeUntil);
  const title = access.pausedUntil
    ? "Студия на паузе"
    : !access.isActive
      ? "Тариф студии не оплачен"
      : access.isTrial
        ? "Пробный период студии"
        : `Тариф студии «${plan?.title ?? "Студия"}»`;

  return (
    <div className="space-y-2 text-sm leading-6 text-ink-soft">
      <p className="text-base font-medium text-ink">{title}</p>
      <p>
        {access.isActive && until ? `Доступ действует до ${until}. ` : ""}
        Тариф оплачивает и продлевает администратор «{profile.workspaceName}».
      </p>
    </div>
  );
}
