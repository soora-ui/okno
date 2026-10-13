"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Clock3,
  MapPin,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import {
  DemoStoryChapter,
  DemoStoryIntro,
  DemoStoryOutro,
} from "@/components/public/demo-story";
import { BrandLogo } from "@/components/layout/brand-logo";
import {
  DemoThemeSwitcher,
  TourThemeBridge,
} from "@/components/public/demo-theme-switcher";
import { PortfolioModal } from "@/components/public/portfolio-modal";
import { PublicMapSection } from "@/components/public/public-map-section";
import { SocialIcon } from "@/components/public/social-icons";
import { ServiceConsultantButton } from "@/components/support/service-consultant-widget";
import {
  getClosestSlots,
  publicDemoStorySteps,
  publicInfoItems,
  publicTrustItems,
  type PublicProfileViewProps,
} from "@/components/public/public-profile-shared";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { bookingThemeAttr } from "@/lib/booking-theme-presets";
import { socialNetworkMeta, socialNetworks } from "@/lib/booking-page-settings";
import { formatCurrency } from "@/lib/mock-data";

export function PublicProfileView({
  profile,
  services,
  bookingSlotsByService,
  bookingHref,
  homeHref = "/",
  eyebrowLabel,
  showDemoSections = true,
  guidedDemo = false,
  guidedDemoCleanHref,
  tourThemeBridge = false,
  certificateSlot,
  consultantServiceIds,
  consultantDemoReplies,
}: PublicProfileViewProps) {
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const closestSlots = getClosestSlots(services, bookingSlotsByService);
  const hasPortfolioWorks = profile.portfolioWorks.length > 0;
  const startingPrice =
    services.length > 0 ? Math.min(...services.map((service) => service.price)) : null;
  const shortestDuration =
    services.length > 0 ? Math.min(...services.map((service) => service.durationMinutes)) : null;
  const { socialLinks, mapLocation } = profile.bookingPageSettings;
  const filledSocials = socialNetworks.filter((network) => socialLinks[network]);

  // В демо-туре пресет можно переключать прямо на странице, поэтому он
  // живёт в состоянии; на реальной странице мастера это просто его пресет.
  const [presetId, setPresetId] = useState(profile.bookingThemePresetId);
  const publicThemeAttr = bookingThemeAttr(presetId);

  // pb-28 на main нужен только под мобильную плавающую кнопку записи
  // (она lg:hidden). На десктопе это было 112px пустоты после подвала,
  // плюс ещё 64px от контейнера — почти экран прокрутки в никуда.
  //
  // isolate обязателен для круговой заливки из DemoThemeSwitcher: слой волны
  // лежит на -z-10, а без собственного контекста наложения у main такой слой
  // всплывает в корневой контекст и оказывается ПОД фоном самого main, то есть
  // невидимым. С isolate он ложится выше фона, но ниже всего содержимого.
  return (
    <main
      {...publicThemeAttr}
      className="relative isolate min-h-screen overflow-x-hidden bg-[var(--color-background)] pb-28 lg:pb-0"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at top left, var(--public-glow-a), transparent 30%), radial-gradient(circle at 85% 15%, var(--public-glow-b), transparent 22%), radial-gradient(circle at bottom right, var(--public-glow-c), transparent 30%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-30 mb-6">
          <div
            className="flex items-center justify-between gap-4 rounded-full border px-4 py-3 shadow-subtle backdrop-blur"
            style={{
              backgroundColor: "var(--public-surface-strong)",
              borderColor: "var(--public-edge)",
            }}
          >
            <BrandLogo href={homeHref} />
            <div className="hidden items-center gap-3 sm:flex">
              <span className="inline-flex items-center gap-2 rounded-full bg-panel px-4 py-2 text-sm text-ink-soft">
                <MapPin size={16} />
                {profile.locationText}
              </span>
              <ButtonLink
                href={bookingHref}
                documentNavigation={guidedDemo}
                className="gap-2"
              >
                Записаться
                <ArrowRight size={16} />
              </ButtonLink>
            </div>
          </div>
        </header>

        {guidedDemo ? <DemoStoryIntro steps={publicDemoStorySteps} /> : null}

        {guidedDemo ? (
          <DemoThemeSwitcher value={presetId} onApply={setPresetId} />
        ) : null}

        {tourThemeBridge ? (
          <TourThemeBridge value={presetId} onApply={setPresetId} />
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div
            data-demo-id="hero"
            className="h-full space-y-5 rounded-section border p-5 shadow-section backdrop-blur sm:p-6 lg:p-8"
            style={{
              backgroundColor: "var(--public-surface)",
              borderColor: "var(--public-edge)",
            }}
          >
            <div className="space-y-3">
              <Badge tone="accent">{eyebrowLabel}</Badge>
              <div data-tour="identity" className="space-y-3">
                <div className="flex items-start justify-between gap-6">
                  <h1 className="min-w-0 flex-1 text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">
                    {profile.fullName}
                  </h1>
                  <div className="shrink-0 overflow-hidden rounded-full border border-white/90 bg-panel shadow-subtle">
                    <Image
                      src={profile.avatarUrl}
                      alt={profile.fullName}
                      width={72}
                      height={72}
                      priority
                      loading="eager"
                      className="h-[60px] w-[60px] object-cover sm:h-[72px] sm:w-[72px]"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-base text-ink-soft">
                  <span>{profile.specialty}</span>
                  <span className="hidden h-1.5 w-1.5 rounded-full bg-[var(--color-line)] sm:block" />
                  <span className="inline-flex items-center gap-2">
                    <MapPin size={17} />
                    {profile.locationText}
                  </span>
                </div>
                {profile.address ? (
                  <p className="text-sm text-ink-soft">{profile.address}</p>
                ) : null}
                {filledSocials.length > 0 ? (
                  <ul className="flex flex-wrap gap-2" aria-label="Соцсети мастера">
                    {filledSocials.map((network) => {
                      const meta = socialNetworkMeta[network];
                      return (
                        <li key={network}>
                          <a
                            href={meta.buildUrl(socialLinks[network])}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={meta.label}
                            title={meta.label}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-soft transition hover:-translate-y-0.5 hover:text-accent-deep"
                            style={{ backgroundColor: "var(--ui-field-bg)" }}
                          >
                            <SocialIcon network={network} size={18} />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
              {profile.bookingPageSettings.headline ? (
                <p className="max-w-2xl text-lg font-medium leading-snug text-ink sm:text-xl">
                  {profile.bookingPageSettings.headline}
                </p>
              ) : null}
              {profile.bookingPageSettings.subheadline ? (
                <p className="max-w-2xl text-sm leading-6 text-muted sm:text-base">
                  {profile.bookingPageSettings.subheadline}
                </p>
              ) : null}
              <p className="max-w-2xl text-base leading-7 text-ink-soft">
                {profile.bio}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {publicTrustItems.map((item) => {
                const icons = {
                  MessageCircleHeart,
                  ShieldCheck,
                  Sparkles,
                } as const;
                const Icon = icons[item.icon];

                return (
                <div
                  key={item.label}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-soft"
                  style={{ backgroundColor: "var(--ui-field-bg)" }}
                >
                  <Icon size={15} className="text-accent-deep" />
                  <span>{item.label}</span>
                </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <ButtonLink
                href={bookingHref}
                documentNavigation={guidedDemo}
                className="gap-2"
              >
                Выбрать время
                <ArrowRight size={16} />
              </ButtonLink>
              {hasPortfolioWorks ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsPortfolioOpen(true)}
                >
                  Готовые работы
                </Button>
              ) : (
                <ButtonLink href="#services" variant="secondary">
                  Посмотреть услуги
                </ButtonLink>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div
                className="rounded-card border border-line px-4 py-3.5"
                style={{ backgroundColor: "var(--ui-card-bg)" }}
              >
                <p className="text-sm text-muted">Цена от</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {startingPrice !== null ? formatCurrency(startingPrice) : "По запросу"}
                </p>
              </div>
              <div
                className="rounded-card border border-line px-4 py-3.5"
                style={{ backgroundColor: "var(--ui-card-bg)" }}
              >
                <p className="text-sm text-muted">Длительность от</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {shortestDuration !== null ? `${shortestDuration} мин` : "Уточняется"}
                </p>
              </div>
              <div
                className="rounded-card border border-line px-4 py-3.5"
                style={{ backgroundColor: "var(--color-accent-soft)" }}
              >
                <p className="text-sm text-muted">Свободные окна</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {closestSlots.length > 0 ? "Есть онлайн" : "По запросу"}
                </p>
              </div>
            </div>
          </div>

          <div
            data-demo-id="slots"
            className="relative h-full overflow-hidden rounded-section border p-5 shadow-section backdrop-blur sm:p-6 lg:p-8"
            style={{
              backgroundColor: "var(--public-surface-strong)",
              borderColor: "var(--public-edge)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at top right, var(--public-glow-a), transparent 26%), radial-gradient(circle at bottom left, var(--public-glow-c), transparent 32%)",
              }}
            />
            <div className="relative">
              {showDemoSections ? (
                <div
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink shadow-subtle backdrop-blur"
                  style={{ backgroundColor: "var(--public-surface-strong)" }}
                >
                  <Sparkles size={16} className="text-accent-deep" />
                  Как выглядит запись
                </div>
              ) : null}

              <div className={showDemoSections ? "mt-6 flex items-start justify-between gap-4" : "flex items-start justify-between gap-4"}>
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-muted">
                    Ближайшие окна
                  </p>
                  <h2 className="mt-1.5 text-2xl font-semibold text-ink sm:text-[1.75rem]">
                    {showDemoSections ? "Можно выбрать онлайн" : "Свободные окна"}
                  </h2>
                </div>
                <CalendarClock size={24} className="mt-1 shrink-0 text-accent-deep" />
              </div>

              {closestSlots.length > 0 ? (
                <div className="mt-5 space-y-2.5">
                  {closestSlots.map((slot) => (
                    guidedDemo ? (
                      <a
                        key={`${slot.serviceId}-${slot.date}-${slot.time}`}
                        href={bookingHref}
                        className="flex items-center justify-between gap-4 rounded-card border border-line px-4 py-3 shadow-subtle transition hover:-translate-y-0.5"
                        style={{ backgroundColor: "var(--ui-card-bg)" }}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-base font-medium text-ink">
                            {slot.serviceTitle}
                          </p>
                          <p className="mt-0.5 text-sm text-ink-soft">{slot.dateLabel}</p>
                        </div>
                        <div className="shrink-0 rounded-full bg-panel px-3.5 py-1.5 text-base font-medium text-ink">
                          {slot.time}
                        </div>
                      </a>
                    ) : (
                      <Link
                        key={`${slot.serviceId}-${slot.date}-${slot.time}`}
                        href={bookingHref}
                        className="flex items-center justify-between gap-4 rounded-card border border-line px-4 py-3 shadow-subtle transition hover:-translate-y-0.5"
                        style={{ backgroundColor: "var(--ui-card-bg)" }}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-base font-medium text-ink">
                            {slot.serviceTitle}
                          </p>
                          <p className="mt-0.5 text-sm text-ink-soft">{slot.dateLabel}</p>
                        </div>
                        <div className="shrink-0 rounded-full bg-panel px-3.5 py-1.5 text-base font-medium text-ink">
                          {slot.time}
                        </div>
                      </Link>
                    )
                  ))}
                </div>
              ) : (
                <div
                  className="mt-6 rounded-card border border-line p-5"
                  style={{ backgroundColor: "var(--ui-card-bg)" }}
                >
                  <p className="text-sm leading-7 text-ink-soft">
                    {showDemoSections
                      ? "Свободные слоты обновляются автоматически. Если сейчас всё занято, открой запись и проверь ближайшие даты."
                      : "Свободных слотов на ближайшие дни пока нет. Можно написать мастеру напрямую или проверить дату позже."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {guidedDemo ? <DemoStoryChapter step={publicDemoStorySteps[2]} /> : null}

        {showDemoSections ? (
          hasPortfolioWorks ? (
            <section
              id="works"
              data-demo-id="works"
              className="relative mt-16 rounded-section space-y-6"
            >
              <Reveal variant="fade-up">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="max-w-2xl space-y-3">
                    <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
                      Готовые работы
                    </p>
                    <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                      Можно заранее почувствовать стиль мастера
                    </h2>
                    <p className="text-base leading-7 text-ink-soft sm:text-lg">
                      Подборка показывает реальные работы из кабинета. Если хочется
                      посмотреть всё крупнее, открой pop-up и пролистай всю галерею.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsPortfolioOpen(true)}
                    className="gap-2"
                  >
                    Открыть всю галерею
                  </Button>
                </div>
              </Reveal>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {profile.portfolioWorks.map((work, index) => (
                  <Reveal key={work.id} variant="fade-up" delay={(index % 4) * 0.1}>
                    <button
                      type="button"
                      onClick={() => setIsPortfolioOpen(true)}
                      className="card-hover group w-full overflow-hidden rounded-section border border-line text-left shadow-card"
                      style={{ backgroundColor: "var(--ui-card-bg)" }}
                    >
                      <div className="relative aspect-[4/5] overflow-hidden">
                        <Image
                          src={work.imageUrl}
                          alt={`${profile.fullName}, работа ${index + 1}`}
                          fill
                          sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 25vw"
                          className="object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(20,21,18,0.72)] to-transparent px-4 py-4">
                          <span
                            className="inline-flex rounded-full px-3 py-1 text-xs font-medium text-ink"
                            style={{ backgroundColor: "var(--public-surface-strong)" }}
                          >
                            Работа {index + 1}
                          </span>
                        </div>
                      </div>
                    </button>
                  </Reveal>
                ))}
              </div>
            </section>
          ) : null
        ) : hasPortfolioWorks ? (
          <section
            id="works"
            data-demo-id="works"
            className="relative mt-14 rounded-section space-y-6"
          >
            <Reveal variant="fade-up">
              <div className="max-w-2xl space-y-2">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
                  Портфолио
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  Работы мастера
                </h2>
              </div>
            </Reveal>
            {hasPortfolioWorks ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <p className="text-sm text-muted">
                    Нажми на любую работу, чтобы открыть галерею.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsPortfolioOpen(true)}
                    className="gap-2"
                  >
                    Открыть галерею
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {profile.portfolioWorks.map((work, index) => (
                    <Reveal key={work.id} variant="fade-up" delay={(index % 4) * 0.1}>
                      <button
                        type="button"
                        onClick={() => setIsPortfolioOpen(true)}
                        className="card-hover group w-full overflow-hidden rounded-section border border-line text-left shadow-card"
                        style={{ backgroundColor: "var(--ui-card-bg)" }}
                      >
                        <div className="relative aspect-[4/5] overflow-hidden">
                          <Image
                            src={work.imageUrl}
                            alt={`${profile.fullName}, работа ${index + 1}`}
                            fill
                            sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 25vw"
                            className="object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                        </div>
                      </button>
                    </Reveal>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {guidedDemo ? <DemoStoryChapter step={publicDemoStorySteps[3]} /> : null}

        <section
          id="services"
          data-demo-id="services"
          className="relative mt-16 rounded-section space-y-6"
        >
          <Reveal variant="fade-up">
            <div className="max-w-2xl space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
                Услуги
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {showDemoSections ? "Понятный каталог услуг" : "Что делает мастер"}
              </h2>
              {showDemoSections ? (
                <p className="text-base leading-7 text-ink-soft sm:text-lg">
                  У каждой услуги сразу видно длительность и цену, поэтому можно
                  выбрать визит без лишних вопросов.
                </p>
              ) : null}
            </div>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2">
            {services.map((service, index) => (
              <Reveal key={service.id} variant="fade-up" delay={(index % 2) * 0.1}>
                <article
                  className="card-hover group relative flex h-full flex-col overflow-hidden rounded-section border border-line p-6 shadow-card"
                  style={{
                    backgroundColor:
                      index % 2 === 0
                        ? "var(--ui-card-bg)"
                        : "var(--color-accent-soft)",
                  }}
                >
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-sm uppercase tracking-[0.18em] text-muted">
                          {service.durationMinutes} минут
                        </p>
                        <h3 className="text-2xl font-semibold text-ink">
                          {service.title}
                        </h3>
                      </div>
                      <div
                        className="rounded-full px-4 py-2 text-sm font-medium text-ink shadow-sm"
                        style={{ backgroundColor: "var(--public-surface-strong)" }}
                      >
                        {formatCurrency(service.price)}
                      </div>
                    </div>

                    <p className="text-sm leading-7 text-ink-soft sm:text-base">
                      {service.description}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <span className="text-sm text-muted">
                        {showDemoSections
                          ? "Запись без регистрации и звонка"
                          : `${service.durationMinutes} мин • ${formatCurrency(service.price)}`}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {consultantServiceIds?.includes(service.id) ? (
                          <ServiceConsultantButton
                            serviceId={service.id}
                            serviceTitle={service.title}
                            label="Задать вопрос"
                            demoReply={consultantDemoReplies?.[service.id]}
                          />
                        ) : null}
                        <ButtonLink
                          href={bookingHref}
                          documentNavigation={guidedDemo}
                          variant="secondary"
                          className="gap-2"
                        >
                          Выбрать
                          <ArrowRight size={16} />
                        </ButtonLink>
                      </div>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {guidedDemo ? <DemoStoryChapter step={publicDemoStorySteps[4]} /> : null}

        {showDemoSections ? (
          <section
            data-demo-id="rules"
            className="relative mt-16 rounded-section grid gap-6 lg:grid-cols-[1.05fr_0.95fr]"
          >
          <Reveal variant="fade-up">
            <div className="h-full rounded-section border border-transparent bg-[image:var(--gradient-ink)] p-6 text-white shadow-hover sm:p-8">
              <p className="text-sm uppercase tracking-[0.24em] text-white/60">
                Как всё устроено
              </p>
              <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
                Страница записи выглядит как витрина мастера, а не как обычная форма
              </h2>
              <div className="mt-8 space-y-4">
                {publicInfoItems.map((item) => {
                  const icons = {
                    CalendarClock,
                    BadgeCheck,
                    Clock3,
                  } as const;
                  const Icon = icons[item.icon];

                  return (
                  <div
                    key={item.title}
                    className="rounded-card border border-white/10 bg-white/6 p-5"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} className="text-[var(--color-accent)]" />
                      <h3 className="text-lg font-medium text-white">{item.title}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-white/70">{item.text}</p>
                  </div>
                  );
                })}
              </div>
            </div>
          </Reveal>

          <Reveal variant="fade-up" delay={0.2}>
            <div className="h-full space-y-6 rounded-section border border-line bg-glass p-6 shadow-card backdrop-blur sm:p-8">
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.24em] text-muted">
                  Что важно знать
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  Всё, что помогает решиться на запись
                </h2>
              </div>

              <div className="grid gap-4">
                <div className="rounded-card border border-line bg-panel p-5">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} className="text-accent-deep" />
                    <h3 className="text-lg font-medium text-ink">Локация и описание</h3>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">
                    Мастер сам указывает район, описание и формат приёма в кабинете, а
                    публичная страница сразу показывает оформленную версию этих данных.
                  </p>
                </div>

                <div className="rounded-card border border-line bg-surface p-5">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={18} className="text-accent-deep" />
                    <h3 className="text-lg font-medium text-ink">Перенос и отмена</h3>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">
                    Мастер сам задаёт, до какого момента запись можно отменить или
                    перенести самостоятельно. Эти правила применяются к каждой записи
                    без ручных уточнений.
                  </p>
                </div>

                <div className="rounded-card border border-line bg-[rgba(238,247,240,0.92)] p-5">
                  <div className="flex items-center gap-3">
                    <MessageCircleHeart size={18} className="text-accent-deep" />
                    <h3 className="text-lg font-medium text-ink">Подтверждение и напоминания</h3>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">
                    После бронирования клиент сразу видит подтверждение на экране, а
                    уведомления и напоминания для клиента и мастера включаются в
                    настройках записи.
                  </p>
                </div>
              </div>

              <div className="rounded-card border border-dashed border-line px-5 py-4 text-sm text-muted">
                Такую страницу не стыдно скинуть клиенту в мессенджер: крупные
                фото, понятные услуги и запись в пару кликов.
              </div>
            </div>
          </Reveal>
        </section>
        ) : null}

        {certificateSlot ? (
          <section className="mt-12">{certificateSlot}</section>
        ) : null}

        {mapLocation ? (
          <PublicMapSection
            location={mapLocation}
            city={profile.locationText}
            address={profile.address}
          />
        ) : null}

        {guidedDemo ? (
          <DemoStoryOutro cleanHref={guidedDemoCleanHref} />
        ) : null}

        {/* Подвал намеренно компактный: это страница мастера, а не сайт okno.
            Было mt-16/pt-6/text-sm — на фоне контента подвал читался как
            отдельная секция. Стало вдвое меньше по отступам и на шаг мельче. */}
        <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Онлайн-запись к {profile.fullName}.</p>
          <Link
            href={homeHref}
            className="inline-flex min-h-6 items-center font-medium text-ink underline underline-offset-4"
          >
            Создано в okno
          </Link>
        </footer>
      </div>

      <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
        <ButtonLink
          href={bookingHref}
          documentNavigation={guidedDemo}
          className="w-full justify-center gap-2 rounded-panel py-4 text-base shadow-hover"
        >
          Записаться онлайн
          <ArrowRight size={18} />
        </ButtonLink>
      </div>

      <PortfolioModal
        fullName={profile.fullName}
        works={profile.portfolioWorks}
        isOpen={isPortfolioOpen}
        onClose={() => setIsPortfolioOpen(false)}
      />
    </main>
  );
}
