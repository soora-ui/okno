import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import type { DemoStoryStep } from "@/components/public/public-profile-shared";

export function DemoStoryIntro({
  steps,
}: {
  steps: DemoStoryStep[];
}) {
  return (
    <section className="mb-10 overflow-hidden rounded-section border border-line bg-glass shadow-section backdrop-blur">
      <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
            Как это видит клиент
          </p>
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Прокрути страницу как клиент — пояснения будут появляться по ходу
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {steps.slice(0, 2).map((step) => (
            <div
              key={step.id}
              className="rounded-card border border-line bg-panel p-4"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                {step.stepLabel}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-ink">{step.eyebrow}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DemoStoryChapter({
  step,
}: {
  step: DemoStoryStep;
}) {
  const toneClasses =
    step.tone === "ink"
      ? {
          shell: "border-transparent bg-[var(--gradient-ink)] text-white shadow-hover",
          eyebrow: "text-white/60",
          description: "text-white/75",
          settings: "border-white/10 bg-white/8 text-white/75",
          settingsLabel: "text-white/55",
        }
      : step.tone === "accent"
        ? {
            shell: "border-accent bg-[rgba(238,247,240,0.9)] text-ink shadow-card",
            eyebrow: "text-accent-deep",
            description: "text-ink-soft",
            settings: "border-white/70 bg-white/78 text-ink-soft",
            settingsLabel: "text-muted",
          }
        : {
            shell: "border-white/80 bg-white/74 text-ink shadow-card",
            eyebrow: "text-muted",
            description: "text-ink-soft",
            settings: "border-line bg-panel text-ink-soft",
            settingsLabel: "text-muted",
          };

  return (
    <section className="mt-12">
      <div className="grid gap-6 xl:grid-cols-[200px_minmax(0,1fr)] xl:items-start">
        <div className="space-y-3 xl:sticky xl:top-24">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
            {step.stepLabel}
          </p>
          <h3 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {step.eyebrow}
          </h3>
        </div>

        <div className={`rounded-section border p-6 sm:p-8 ${toneClasses.shell}`}>
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {step.title}
              </h3>
              <p className={`text-base leading-8 sm:text-lg ${toneClasses.description}`}>
                {step.description}
              </p>
            </div>

            <div className={`rounded-card border p-5 ${toneClasses.settings}`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${toneClasses.settingsLabel}`}>
                Что настраивает мастер
              </p>
              <p className="mt-3 text-sm leading-7">{step.settings}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DemoStoryOutro({
  cleanHref,
}: {
  cleanHref?: string;
}) {
  return (
    <section className="mt-16 rounded-section border border-line bg-glass px-6 py-7 shadow-card backdrop-blur sm:px-8 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
            Финал
          </p>
          <h3 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Дальше можно посмотреть тот же профиль уже без пояснений
          </h3>
          <p className="max-w-2xl text-base leading-7 text-ink-soft sm:text-lg">
            Это тот же demo-профиль, но без пояснений. Так проще оценить, как
            страница выглядит сама по себе и готова ли она к отправке клиенту.
          </p>
        </div>

        {cleanHref ? (
          <ButtonLink
            href={cleanHref}
            documentNavigation
            variant="secondary"
            className="justify-center gap-2"
          >
            Открыть чистый профиль
            <ArrowRight size={16} />
          </ButtonLink>
        ) : null}
      </div>
    </section>
  );
}
