import { CheckCircle2 } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { getPricingData } from "@/lib/data";
import { profile as mockProfile } from "@/lib/mock-data";

export default async function PricingPage() {
  const pricingPlans = getPricingData();
  const profile = mockProfile;

  return (
    <SiteShell resolveAuth={false}>
      <div className="space-y-8 py-6">
        <Reveal variant="blur">
          <div className="space-y-4">
            <Badge tone="accent">Тарифы без агрессии</Badge>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-ink">
              Бесплатный тариф запускает, платный помогает расти.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-ink-soft">
              Вы всегда заранее видите, сколько записей осталось в этом месяце, и сами
              решаете, когда перейти на платный тариф.
            </p>
          </div>
        </Reveal>

        <Reveal variant="fade-up" delay={0.15}>
          <Card
            className="border-transparent text-white"
            style={{
              background:
                "linear-gradient(135deg, #23241f 0%, #35362f 100%)",
            }}
          >
            <p className="text-sm uppercase tracking-[0.24em] text-white/70">Пример лимита</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">
              Например, осталось {profile.monthlyBookingLimit - profile.monthlyBookingsUsed} из{" "}
              {profile.monthlyBookingLimit} записей
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
              Остаток записей всегда на виду — вы заранее видите, когда лимит подходит
              к концу, и успеваете подключить платный тариф.
            </p>
          </Card>
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
                <h2 className="mt-3 text-4xl font-semibold text-ink">
                  {plan.price}
                </h2>
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
                <div className="mt-6">
                  <ButtonLink href="/register" variant={plan.title === "okno Pro" ? "primary" : "secondary"}>
                    {plan.title === "okno Pro" ? "Оставить интерес к Pro" : "Начать бесплатно"}
                  </ButtonLink>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
