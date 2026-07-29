import { CheckCircle2 } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { extraSeat, formatPlanPrice, trialOffer } from "@/config/plans";
import { getPricingData } from "@/lib/data";

export default function PricingPage() {
  const pricingPlans = getPricingData();

  return (
    <SiteShell resolveAuth={false}>
      <div className="space-y-8 py-6">
        <Reveal variant="blur">
          <div className="space-y-4">
            <Badge tone="accent">Тарифы</Badge>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-ink">
              Месяц на пробу, дальше — тариф под размер команды.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-ink-soft">
              Тариф выбирается один раз и меняется, когда меняется работа: мастер
              работает один, потом подключает предоплату, потом набирает команду.
            </p>
          </div>
        </Reveal>

        <Reveal variant="fade-up" delay={0.15}>
          <Card
            className="border-transparent text-white"
            style={{
              background: "linear-gradient(135deg, #23241f 0%, #35362f 100%)",
            }}
          >
            <p className="text-sm uppercase tracking-[0.24em] text-white/70">
              {trialOffer.title}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white">
              30 дней с момента регистрации
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
              {trialOffer.description}
            </p>
          </Card>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pricingPlans.map((plan, index) => (
            <Reveal key={plan.id} variant="fade-up" delay={index * 0.1}>
              <Card
                className={`flex h-full flex-col ${plan.highlighted ? "bg-panel" : ""}`}
              >
                <p className="text-sm uppercase tracking-[0.24em] text-ink-soft">
                  {plan.title}
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <h2 className="text-4xl font-semibold text-ink">
                    {formatPlanPrice(plan.priceRub)}
                  </h2>
                  <span className="text-sm text-muted">{plan.period}</span>
                </div>
                <p className="mt-3 text-base leading-7 text-ink-soft">
                  {plan.description}
                </p>
                <div className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex gap-3">
                      <CheckCircle2 size={18} className="mt-1 shrink-0 text-success" />
                      <p className="text-base leading-7 text-ink-soft">{feature}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-6">
                  <ButtonLink
                    href="/register"
                    variant={plan.highlighted ? "primary" : "secondary"}
                  >
                    Попробовать месяц
                  </ButtonLink>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal variant="fade-up">
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-base font-semibold text-ink">{extraSeat.title}</p>
              <p className="text-sm leading-6 text-ink-soft">{extraSeat.description}</p>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-semibold text-ink">{extraSeat.price}</p>
              <span className="text-sm text-muted">{extraSeat.period}</span>
            </div>
          </Card>
        </Reveal>
      </div>
    </SiteShell>
  );
}
