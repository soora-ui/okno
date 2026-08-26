import type { ReactNode } from "react";
import Link from "next/link";
import { SiteShell } from "@/components/layout/site-shell";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import {
  LegalBody,
  LegalDocumentHeader,
  LegalDraftNotice,
  LegalToc,
  type LegalAppendix,
  type LegalSection,
} from "@/components/legal/legal-document";
import type { LegalDocument } from "@/config/legal";

// Общая раскладка для всех правовых документов: шапка с номером редакции,
// оглавление сбоку и сам текст. Страницы отличаются только содержимым
// sections; приложение (у оферты — Поручение на обработку ПДн) идёт следом со
// своей нумерацией.
export function LegalDocumentPage({
  doc,
  sections,
  appendix,
  intro,
  notice,
}: {
  doc: LegalDocument;
  sections: LegalSection[];
  appendix?: LegalAppendix;
  // Преамбула документа — текст до первого нумерованного раздела.
  intro?: ReactNode;
  // Врезка над текстом: например, пометка, что документ является шаблоном.
  notice?: ReactNode;
}) {
  return (
    <SiteShell resolveAuth={false} showFooter>
      <div className="space-y-10 py-6">
        <Reveal variant="blur">
          <div className="space-y-6">
            <div>
              <Link
                href="/legal"
                className="print-hidden text-sm text-muted underline underline-offset-4 transition hover:text-ink"
              >
                ← Правовые документы
              </Link>
            </div>
            <LegalDocumentHeader doc={doc} />
          </div>
        </Reveal>

        <LegalDraftNotice doc={doc} />
        {notice}

        <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          <LegalToc sections={sections} appendix={appendix} />
          <Card className="print-no-shadow px-6 py-8 sm:px-10 sm:py-10">
            {intro ? (
              <p className="mb-10 text-base leading-7 text-ink-soft">{intro}</p>
            ) : null}
            <LegalBody sections={sections} />
            {appendix ? (
              <div className="mt-14 space-y-6 border-t border-line pt-12">
                <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  {appendix.title}
                </h2>
                {appendix.intro ? (
                  <p className="text-base leading-7 text-ink-soft">
                    {appendix.intro}
                  </p>
                ) : null}
                <LegalBody
                  sections={appendix.sections}
                  anchorPrefix={appendix.anchorPrefix}
                />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </SiteShell>
  );
}
