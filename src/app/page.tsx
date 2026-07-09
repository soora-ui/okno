import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  MessageSquareText,
  Sparkles,
  Users2,
} from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
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
import { pricingPlans } from "@/lib/mock-data";

const valueProps = [
  "Мастер запускается за 3 шага и получает ссылку сразу",
  "Можно создать кабинет мастера, студии, салона или барбершопа",
  "Клиент записывается без регистрации, капчи и лишних экранов",
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
      publicPageHrefOverride={landingDemoPublicPageHref}
      publicPageLabelOverride="Демо-страница"
    >
      <div className="space-y-20 pb-10">
        <section className="grid gap-8 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
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
                  `okno` помогает частным мастерам, салонам и небольшим командам перестать
                  вести запись вручную. У мастера появляется порядок, у администратора общая
                  картина, у клиента понятный путь к записи.
                </p>
              </Reveal>
            </div>
            <Reveal variant="blur" delay={0.3}>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/register" className="gap-2">
                  Начать бесплатно
                  <ArrowRight size={16} />
                </ButtonLink>
                <ButtonLink href={landingDemoPublicPageHref} variant="secondary">
                  Открыть демо-профиль
                </ButtonLink>
              </div>
            </Reveal>
            <div className="grid gap-3 sm:grid-cols-3">
              {valueProps.map((item, index) => (
                <Reveal key={item} variant="fade-up" delay={index * 0.1}>
                  <Card className="rounded-[24px] p-4">
                    <p className="text-sm leading-6 text-ink-soft">{item}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>

          <RoundedReveal finalRadius="28px">
            <Card className="overflow-hidden p-0">
              <div className="m-4 rounded-[24px] border border-line bg-panel p-5">
                <p className="text-sm text-muted">Независимое demo-превью</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  {landingDemoProfile.fullName}
                </h2>
                <p className="mt-1 text-sm text-ink-soft">{landingDemoProfile.bio}</p>
              </div>
              <div className="space-y-4 px-4 pb-4">
                {landingDemoServices.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-[24px] border border-line p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-medium text-ink">{service.title}</p>
                        <p className="text-sm leading-6 text-muted">
                          {service.description}
                        </p>
                      </div>
                      <div className="text-right text-sm text-ink-soft">
                        <p>{service.durationMinutes} мин</p>
                        <p>{service.price} ₽</p>
                      </div>
                    </div>
                  </div>
                ))}
                <ButtonLink href={landingDemoBookHref} className="w-full justify-center">
                  Записаться онлайн
                </ButtonLink>
              </div>
            </Card>
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
                <Card>
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
                <Card>
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
            <Card className="space-y-4">
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
              <ButtonLink href="/register" variant="secondary" className="w-fit gap-2">
                Создать компанию или салон
                <ArrowRight size={16} />
              </ButtonLink>
            </Card>
          </Reveal>

          <Reveal variant="fade-up" delay={0.2}>
            <Card
              className="space-y-4 border-transparent text-white"
              style={{
                background:
                  "linear-gradient(135deg, #23241f 0%, #35362f 100%)",
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
              eyebrow="Тарифы"
              title="Бесплатного тарифа хватает для работы, а платный снимает лимиты."
              description="Понятные лимиты и честные условия. Платить можно, когда почувствуете, что нужно больше."
            />
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-2">
            {pricingPlans.map((plan, index) => (
              <Reveal key={plan.title} variant="fade-up" delay={index * 0.1}>
                <Card
                  className={plan.title === "okno Pro" ? "bg-panel" : ""}
                >
                  <p className="text-sm uppercase tracking-[0.24em] text-ink-soft">
                    {plan.title}
                  </p>
                  <h3 className="mt-3 text-4xl font-semibold text-ink">
                    {plan.price}
                  </h3>
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
        </section>
      </div>
    </SiteShell>
  );
}
