import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Шапка карточки настроек: заголовок, пояснение под ним и, справа, что-то
// короткое — статус или переключатель. Без цветных иконок: в новом кабинете
// карточки различаются заголовками, а иконки живут в навигации по разделам.
export function SettingsSectionHeading({
  id,
  title,
  description,
  trailing,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        {/* В мобильном аккордеоне «Записи» заголовок уже стоит в строке
            раздела — там этот прячется, а пояснение остаётся. */}
        <h3
          id={id}
          data-settings-title
          className="text-xl font-semibold leading-tight text-ink"
        >
          {title}
        </h3>
        {description ? (
          <p className="text-sm leading-6 text-ink-soft">{description}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export function SettingsSection({
  id,
  title,
  description,
  trailing,
  className,
  children,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;

  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-28">
      <Card className={cn("space-y-5 p-5 sm:p-6", className)}>
        <SettingsSectionHeading
          id={headingId}
          title={title}
          description={description}
          trailing={trailing}
        />
        {children}
      </Card>
    </section>
  );
}
