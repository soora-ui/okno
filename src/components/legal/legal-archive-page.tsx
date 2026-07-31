import Link from "next/link";
import { FileText } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import {
  formatLegalDate,
  getArchivedLegalEditions,
  getCurrentLegalEdition,
  type LegalDocument,
  type LegalEdition,
} from "@/config/legal";

function EditionPeriod({ edition }: { edition: LegalEdition }) {
  return (
    <span className="tabular-nums">
      {formatLegalDate(edition.effectiveFrom)} —{" "}
      {edition.supersededOn ? formatLegalDate(edition.supersededOn) : "по настоящее время"}
    </span>
  );
}

export function LegalArchivePage({ doc }: { doc: LegalDocument }) {
  const current = getCurrentLegalEdition(doc);
  const archived = getArchivedLegalEditions(doc);

  return (
    <SiteShell resolveAuth={false} showFooter>
      <div className="space-y-10 py-6">
        <Reveal variant="blur">
          <div className="space-y-5">
            <div>
              <Link
                href={doc.href}
                className="text-sm text-muted underline underline-offset-4 transition hover:text-ink"
              >
                ← {doc.navTitle}
              </Link>
            </div>
            <div>
              <Badge tone="accent">Архив редакций</Badge>
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              {doc.navTitle}: предыдущие редакции
            </h1>
            <p className="max-w-2xl text-base leading-7 text-ink-soft">
              К отношениям сторон применяется редакция, действовавшая на дату
              совершения действия. Прежние редакции остаются доступны здесь в
              виде PDF-файлов и не изменяются после публикации следующей.
            </p>
          </div>
        </Reveal>

        <Reveal variant="fade-up" delay={0.1}>
          <Card className="flex flex-wrap items-center justify-between gap-5 bg-panel">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Действующая редакция
              </p>
              <p className="text-lg font-semibold text-ink">
                Редакция {current.version}
              </p>
              <p className="text-sm text-ink-soft">
                <EditionPeriod edition={current} />
              </p>
            </div>
            <ButtonLink href={doc.href} variant="secondary">
              Читать документ
            </ButtonLink>
          </Card>
        </Reveal>

        {archived.length > 0 ? (
          <Reveal variant="fade-up" delay={0.15}>
            <div className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Утратившие силу
              </h2>
              <div className="space-y-4">
                {archived.map((edition) => (
                  <Card
                    key={edition.version}
                    className="flex flex-wrap items-center justify-between gap-5"
                  >
                    <div className="space-y-2">
                      <p className="text-base font-semibold text-ink">
                        Редакция {edition.version}
                      </p>
                      <p className="text-sm text-muted">
                        <EditionPeriod edition={edition} />
                      </p>
                      <p className="max-w-xl text-sm leading-6 text-ink-soft">
                        {edition.summary}
                      </p>
                    </div>
                    {edition.source.kind === "pdf" ? (
                      <ButtonLink
                        href={edition.source.href}
                        variant="secondary"
                        documentNavigation
                      >
                        <FileText size={16} className="mr-2" />
                        Скачать PDF
                      </ButtonLink>
                    ) : (
                      <ButtonLink href={doc.href} variant="secondary">
                        Открыть
                      </ButtonLink>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          </Reveal>
        ) : (
          <Reveal variant="fade-up" delay={0.15}>
            <Card className="space-y-3">
              <h2 className="text-lg font-semibold text-ink">
                Предыдущих редакций пока нет
              </h2>
              <p className="max-w-2xl text-base leading-7 text-ink-soft">
                Редакция {current.version} — первая. Когда документ изменится,
                она переедет сюда PDF-файлом с указанием периода действия, а на
                странице документа останется актуальный текст.
              </p>
            </Card>
          </Reveal>
        )}
      </div>
    </SiteShell>
  );
}
