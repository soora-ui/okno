import { CheckCircle2 } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type DemoConfirmPageProps = {
  searchParams: Promise<{
    service?: string;
    date?: string;
    time?: string;
    name?: string;
  }>;
};

export default async function DemoConfirmPage({
  searchParams,
}: DemoConfirmPageProps) {
  const query = await searchParams;
  const service = typeof query.service === "string" ? query.service : "Услуга";
  const date = typeof query.date === "string" ? query.date : "";
  const time = typeof query.time === "string" ? query.time : "";
  const name = typeof query.name === "string" ? query.name : "Клиент";

  return (
    <SiteShell compact hideGuestMenu resolveAuth={false}>
      <div className="mx-auto max-w-3xl py-10">
        <Card className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle2 size={28} className="text-success" />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold text-ink">Демо-подтверждение</h1>
            <p className="text-sm leading-7 text-ink-soft">
              {name}, так выглядел бы финальный экран после записи. Это отдельный
              демонстрационный контур, он не создает реальную запись в базе.
            </p>
          </div>
          <div className="rounded-card bg-panel p-5 text-left">
            <p className="font-medium text-ink">{service}</p>
            <p className="mt-2 text-sm text-ink-soft">
              {date && time ? `${date} • ${time}` : "Выбранный слот"}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/demo/public-page/book" variant="secondary">
              Пройти еще раз
            </ButtonLink>
            <ButtonLink href="/register">Создать свою страницу</ButtonLink>
          </div>
        </Card>
      </div>
    </SiteShell>
  );
}
