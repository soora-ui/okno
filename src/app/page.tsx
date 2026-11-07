import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Flame,
  Gift,
  MessageSquareText,
  ShieldCheck,
  Route,
  Sparkles,
  Users2,
} from "lucide-react";
import { DemoTourTeaser } from "@/components/landing/demo-tour-teaser";
import { HeroLinkBuilder } from "@/components/landing/hero-link-builder";
import { SiteShell } from "@/components/layout/site-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { SectionTitle } from "@/components/sections/section-title";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { RoundedReveal } from "@/components/ui/rounded-reveal";
import {
  landingDemoBookHref,
  landingDemoProfile,
  landingDemoPublicPageHref,
  landingDemoServices,
} from "@/lib/landing-demo";
import {
  billingPeriods,
  extraSeat,
  formatPlanPrice,
  pricingPlans,
  trialDays,
} from "@/config/plans";
import { legalEntity } from "@/config/legal";
import {
  siteDescription,
  siteFeatureList,
  siteName,
  siteTitle,
  siteUrl,
} from "@/config/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName,
    locale: "ru_RU",
    type: "website",
  },
};

// Цены в разметке берём из тех же тарифов, что видит мастер, — иначе
// после смены цены сниппет начнёт врать. Рейтинга нет сознательно: без
// реальных отзывов на внешних площадках Яндекс за него наказывает.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: siteName,
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      email: legalEntity.email,
      legalName: legalEntity.name,
      taxID: legalEntity.inn,
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      url: siteUrl,
      description: siteDescription,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      featureList: siteFeatureList,
      inLanguage: "ru",
      publisher: { "@id": `${siteUrl}/#organization` },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "RUB",
        lowPrice: Math.min(...pricingPlans.map((plan) => plan.priceRub)),
        highPrice: Math.max(...pricingPlans.map((plan) => plan.priceRub)),
        offerCount: pricingPlans.length,
      },
    },
  ],
};

// Лендинг показывает месячную цену: переключатель периода — инструмент выбора,
// а здесь мастер ещё не выбирает, а приценивается. Про скидку говорим строкой,
// подробности и сам переключатель — на /pricing.
const maxPrepaidDiscount = Math.max(
  ...billingPeriods.map((period) => period.discountPercent),
);

const demoTourHref = "/demo/tour";

const valueProps = [
  "Мастер запускается за 3 шага и получает ссылку сразу",
  "Можно создать кабинет мастера, студии, салона или барбершопа",
  "Клиент записывается без регистрации, капчи и лишних экранов",
];

const features = [
  {
    icon: CreditCard,
    title: "Предоплата за услугу",
    text: "Слот держится 15 минут под оплату. Деньги идут напрямую в вашу ЮKassa, мимо сервиса.",
  },
  {
    icon: Gift,
    title: "Подарочные сертификаты",
    text: "Номиналы задаёте сами, дизайн генерируется один раз. Погашение — сканером QR в кабинете, можно частями.",
  },
  {
    icon: ShieldCheck,
    title: "Рейтинг надёжности клиента",
    text: "Считается по вашим же отметкам «пришёл» и «не пришёл». Виден только вам и никуда больше не уходит.",
  },
  {
    icon: Bot,
    title: "AI-консультант по услугам",
    text: "Отвечает клиентам строго по мануалу, который написали вы. На вопрос вне мануала говорит, что не знает.",
  },
  {
    icon: BellRing,
    title: "Напоминания и отмена по ссылке",
    text: "Клиент добавляет визит в календарь телефона и отменяет по ссылке сам, мастеру — уведомление в Telegram.",
  },
  {
    icon: Users2,
    title: "Приглашения мастеров",
    text: "Позвали мастера по своей ссылке, он оплатил первый месяц — вам +30 дней подписки.",
  },
];

// Инструменты привлечения клиентов (документы/горящие-окошки.md,
// документы/источники-записей.md). Тексты — самодостаточные ответы на
// «как заполнить свободные окошки» и «как понять, откуда клиенты»: такие
// блоки поиск и AI-ассистенты цитируют охотнее, чем список преимуществ.
const growthTools = [
  {
    icon: Flame,
    title: "Горящие окошки для сторис и чатов",
    text: "okno собирает свободное время на сегодня, завтра и послезавтра из вашего расписания — ровно то, что клиент увидит на странице записи. Одной кнопкой получаете вертикальную картинку 1080×1920 для сторис в Instagram, Telegram или VK: три стиля, пять цветов, ваше имя и ссылка на запись. Или готовый текст со свободными окошками, чтобы вставить в чат с клиентами.",
    points: [
      "Окошки пересчитываются с каждой новой записью",
      "На телефоне картинка сразу открывается в меню «Поделиться»",
      "Свободное окно на странице записи ведёт клиента сразу на это время",
    ],
  },
  {
    icon: Route,
    title: "Источники записей: откуда приходят клиенты",
    text: "Для каждой площадки — своя ссылка на запись: Instagram, Telegram, ВКонтакте, WhatsApp, Авито, Яндекс Карты, 2ГИС. В кабинете видно, сколько онлайн-записей дал каждый канал за последние 30 дней. Если клиент пришёл без метки, okno определяет источник по сайту, с которого он перешёл, например из поиска.",
    points: [
      "Видно, какую соцсеть стоит вести, а какую можно отложить",
      "Без сторонних счётчиков и cookie: метка хранится только в записи",
      "Ссылка с меткой выглядит для клиента как обычный адрес страницы",
    ],
  },
];

const comparisons = [
  {
    title: "Перегруженные сервисы",
    points: [
      "Сложный первый запуск и пугающий кабинет",
      "Бизнес-термины вместо понятного языка",
      "Запись выглядит как форма из банка",
    ],
  },
  {
    title: "okno",
    points: [
      "Интерфейс, который не стыдно показать клиенту",
      "Минимум настроек и только нужные действия",
      "Клиент видит понятную страницу, а не рекламные баннеры",
    ],
  },
];

export default function HomePage() {
  return (
    <SiteShell
      hideGuestMenu
      publicPageHrefOverride={demoTourHref}
      publicPageLabelOverride="Демо-тур"
      showFooter
    >
      <JsonLd data={structuredData} />
      <div className="space-y-20 pb-10">
        <section className="grid gap-8 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch">
          <div className="space-y-8">
            <Reveal variant="blur">
              <Badge tone="accent">Для мастеров, студий, салонов и барбершопов</Badge>
            </Reveal>
            <div className="space-y-5">
              <Reveal variant="blur" delay={0.15}>
                <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
                  Онлайн-запись для мастера и команды без тяжёлой CRM.
                </h1>
              </Reveal>
              <Reveal variant="blur" delay={0.3}>
                <p className="max-w-2xl text-lg leading-8 text-ink-soft">
                  okno помогает частным мастерам, салонам и небольшим командам перестать
                  вести запись вручную. У мастера появляется порядок, у администратора общая
                  картина, у клиента понятный путь к записи.
                </p>
              </Reveal>
            </div>
            <Reveal variant="blur" delay={0.3}>
              {/* Мастер-одиночка и владелец салона приходят за разным, а раньше
                  обе кнопки вели на один и тот же /register, где выбор формата
                  начинался заново. Спрашиваем прямо здесь и передаём ответ
                  дальше параметром mode. */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <ButtonLink
                    href="/register?mode=solo"
                    variant="secondary"
                    className="gap-2"
                  >
                    Я частный мастер
                    <ArrowRight size={16} />
                  </ButtonLink>
                  <ButtonLink
                    href="/register?mode=studio"
                    variant="secondary"
                    className="gap-2"
                  >
                    У меня студия или салон
                    <ArrowRight size={16} />
                  </ButtonLink>
                </div>
                <p className="text-sm leading-6 text-ink-soft">
                  {trialDays} дней бесплатно, карта не нужна. Или{" "}
                  <Link
                    href={demoTourHref}
                    className="underline underline-offset-4 transition hover:text-ink"
                  >
                    посмотреть демо-тур
                  </Link>
                  .
                </p>
              </div>
            </Reveal>
          </div>

          {/* Справа в герое — вход в демо-тур: показать продукт в деле
              важнее, чем сразу просить заполнить поля. */}
          <RoundedReveal finalRadius="28px" className="h-full">
            <DemoTourTeaser layout="stack" />
          </RoundedReveal>

          {/* Преимущества — отдельным рядом на всю ширину: тизер справа
              заканчивается вровень с «30 дней бесплатно», без пустоты под ним. */}
          <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
            {valueProps.map((item, index) => (
              <Reveal key={item} variant="fade-up" delay={index * 0.1}>
                <Card className="h-full rounded-nested p-4">
                  <p className="text-sm leading-6 text-ink-soft">{item}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        <section>
          <RoundedReveal finalRadius="28px">
            <HeroLinkBuilder
              demoName={landingDemoProfile.fullName}
              demoSpecialty={landingDemoProfile.specialty}
              demoBio={landingDemoProfile.bio}
              services={landingDemoServices}
              bookHref={landingDemoBookHref}
              layout="wide"
            />
          </RoundedReveal>
        </section>

        <section className="space-y-8">
          <Reveal variant="fade-up">
            <SectionTitle
              eyebrow="Почему okno"
              title="Простой инструмент для записи, без лишних настроек."
              description="Главное — чтобы мастер не терял клиентов, а клиенту было удобно записываться."
            />
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-2">
            {comparisons.map((comparison, index) => (
              <Reveal key={comparison.title} variant="fade-up" delay={index * 0.1}>
                <Card className="h-full">
                  <h3 className="text-xl font-semibold text-ink">
                    {comparison.title}
                  </h3>
                  <div className="mt-5 space-y-3">
                    {comparison.points.map((point) => (
                      <div key={point} className="flex gap-3">
                        <CheckCircle2
                          size={18}
                          className="mt-1 shrink-0 text-accent-deep"
                        />
                        <p className="text-sm leading-6 text-ink-soft">{point}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="space-y-8">
          <Reveal variant="fade-up">
            <SectionTitle
              eyebrow="Как работает"
              title="Три шага, после которых у мастера уже есть рабочая ссылка."
              description="Не нужно разбираться в настройках: создаем профиль, первую услугу и готовую страницу для клиента."
            />
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              {
                icon: CalendarDays,
                title: "1. Создать профиль",
                text: "Можно открыть личный кабинет мастера или сразу зарегистрировать студию, салон или барбершоп с общим кабинетом для команды.",
              },
              {
                icon: Sparkles,
                title: "2. Добавить первую услугу",
                text: "Цена, длительность и короткое описание вроде “включает покрытие, без дизайна”.",
              },
              {
                icon: MessageSquareText,
                title: "3. Отправить ссылку клиенту",
                text: "Клиент выбирает мастера, услугу, дату и время, а затем сразу попадает на экран подтверждения.",
              },
            ].map((item, index) => (
              <Reveal key={item.title} variant="fade-up" delay={index * 0.1}>
                <Card className="h-full">
                  <item.icon size={28} className="text-accent-deep" />
                  <h3 className="mt-6 text-xl font-semibold text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ink-soft">
                    {item.text}
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <Reveal variant="fade-up">
            <Card className="h-full space-y-4">
              <div className="flex items-center gap-3">
                <Users2 size={20} className="text-accent-deep" />
                <h3 className="text-xl font-semibold text-ink">
                  Для команды и бизнеса
                </h3>
              </div>
              <p className="text-sm leading-7 text-ink-soft">
                Администратор видит сотрудников, общую загрузку и клиентов команды, а каждый
                мастер продолжает работать в своем отдельном кабинете без лишней путаницы.
              </p>
              <ButtonLink
                href="/register?mode=studio"
                variant="secondary"
                className="w-fit gap-2"
              >
                Создать компанию или салон
                <ArrowRight size={16} />
              </ButtonLink>
            </Card>
          </Reveal>

          <Reveal variant="fade-up" delay={0.2}>
            <Card
              className="h-full space-y-4 border-transparent text-white"
              style={{
                background:
                  "var(--gradient-ink)",
              }}
            >
              <div className="flex items-center gap-2">
                <BriefcaseBusiness size={18} />
                <p className="text-sm uppercase tracking-[0.24em] text-white/60">Для владельца</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-semibold text-white">
                  Одна ссылка для записи, отдельные кабинеты для команды
                </h3>
                <p className="max-w-lg text-sm leading-7 text-white/70">
                  Публичная страница компании может сначала вести к выбору мастера или услуги,
                  а уже потом к свободным окнам конкретного специалиста.
                </p>
              </div>
              <ButtonLink href={landingDemoPublicPageHref} variant="secondary" className="w-fit bg-surface text-ink">
                Посмотреть публичную страницу
              </ButtonLink>
            </Card>
          </Reveal>
        </section>

        <section className="space-y-8">
          <Reveal variant="fade-up">
            <SectionTitle
              eyebrow="Что уже работает"
              title="Не только запись: деньги, напоминания и подстраховка от неявок."
              description="Всё перечисленное работает в сервисе сегодня, а не значится в планах."
            />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Reveal key={feature.title} variant="fade-up" delay={(index % 3) * 0.1}>
                <Card className="h-full">
                  <feature.icon size={24} className="text-accent-deep" />
                  <h3 className="mt-5 text-lg font-semibold text-ink">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ink-soft">
                    {feature.text}
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="space-y-8">
          <Reveal variant="fade-up">
            <SectionTitle
              eyebrow="Привлечение клиентов"
              title="Как заполнить свободные окошки и понять, откуда приходят клиенты."
              description="Сервис сам находит свободное время для сторис и показывает, какие площадки приводят записи."
            />
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-2">
            {growthTools.map((tool, index) => (
              <Reveal key={tool.title} variant="fade-up" delay={index * 0.1}>
                <Card className="h-full">
                  <tool.icon size={24} className="text-accent-deep" />
                  <h3 className="mt-5 text-xl font-semibold text-ink">{tool.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">{tool.text}</p>
                  <div className="mt-5 space-y-3">
                    {tool.points.map((point) => (
                      <div key={point} className="flex gap-3">
                        <CheckCircle2 size={18} className="mt-1 shrink-0 text-accent-deep" />
                        <p className="text-sm leading-6 text-ink-soft">{point}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
          <Reveal variant="fade-up">
            <p className="text-sm leading-6 text-muted">
              Горящие окошки есть во всех тарифах: в студии каждый мастер делится своими,
              а администратор выбирает мастера и делится его окошками. Источники записей
              пока только у частного мастера.
            </p>
          </Reveal>
        </section>

        <section className="space-y-8">
          <Reveal variant="fade-up">
            <SectionTitle
              eyebrow="Тарифы"
              title="Первый месяц бесплатно, дальше — от 690 ₽."
              description={`Тариф зависит от того, работаете вы один или собираете команду. При оплате вперёд — скидка до ${maxPrepaidDiscount} %.`}
            />
          </Reveal>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pricingPlans.map((plan, index) => (
              <Reveal key={plan.id} variant="fade-up" delay={index * 0.1}>
                <Card
                  className={`flex h-full flex-col ${plan.highlighted ? "bg-panel" : ""}`}
                >
                  {/* Заголовок — название тарифа, а не цена: см. pricing/page.tsx */}
                  <h3 className="text-xl font-semibold text-ink">{plan.title}</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-4xl font-semibold text-ink">
                      {formatPlanPrice(plan.priceRub)}
                    </p>
                    <span className="text-sm text-muted">{plan.period}</span>
                  </div>
                  <p className="mt-3 text-base leading-7 text-ink-soft">
                    {plan.description}
                  </p>
                  <div className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex gap-3">
                        <CheckCircle2 size={18} className="mt-1 shrink-0 text-accent-deep" />
                        <p className="text-base leading-7 text-ink-soft">{feature}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
          <Reveal variant="fade-up">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-nested border border-line px-6 py-5">
              <p className="text-sm leading-6 text-ink-soft">
                {extraSeat.description}
              </p>
              <p className="text-lg font-semibold text-ink">
                {extraSeat.price} {extraSeat.period}
              </p>
            </div>
          </Reveal>
        </section>
      </div>
    </SiteShell>
  );
}
