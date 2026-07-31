import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/layout/site-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import {
  formatLegalDate,
  getCurrentLegalEdition,
  legalDocuments,
} from "@/config/legal";

export const metadata: Metadata = {
  title: "Правовые документы — okno",
  description:
    "Публичная оферта, политика в отношении обработки персональных данных и архив предыдущих редакций okno.business.",
};

export default function LegalIndexPage() {
  return (
    <SiteShell resolveAuth={false} showFooter>
      <div className="space-y-8 py-6">
        <Reveal variant="blur">
          <div className="space-y-4">
            <Badge tone="accent">Документы</Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Правовые документы сервиса
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-ink-soft">
              Условия работы с сервисом и порядок обработки персональных данных.
              Каждая редакция сохраняется: к отношениям сторон применяется та,
              что действовала на дату события.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-2">
          {legalDocuments.map((doc, index) => {
            const edition = getCurrentLegalEdition(doc);

            return (
              <Reveal key={doc.id} variant="fade-up" delay={index * 0.1}>
                <Card className="flex h-full flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">Редакция {edition.version}</Badge>
                    {doc.status === "draft" ? (
                      <Badge tone="warning">Черновик</Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
                    {doc.navTitle}
                  </h2>
                  <p className="mt-3 text-base leading-7 text-ink-soft">
                    {doc.description}
                  </p>
                  <p className="mt-4 text-sm text-muted">
                    {doc.status === "draft"
                      ? "Планируемая дата вступления в силу: "
                      : "Действует с "}
                    {formatLegalDate(edition.effectiveFrom)}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-4 pt-6">
                    <ButtonLink href={doc.href}>Читать</ButtonLink>
                    <Link
                      href={doc.archiveHref}
                      className="text-sm text-ink-soft underline underline-offset-4 transition hover:text-ink"
                    >
                      Архив редакций
                    </Link>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>
    </SiteShell>
  );
}
