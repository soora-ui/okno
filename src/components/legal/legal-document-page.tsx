import Link from "next/link";
import { SiteShell } from "@/components/layout/site-shell";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import {
  LegalBody,
  LegalDocumentHeader,
  LegalDraftNotice,
  LegalToc,
  type LegalSection,
} from "@/components/legal/legal-document";
import type { LegalDocument } from "@/config/legal";

// Общая раскладка для оферты и политики: шапка с номером редакции, оглавление
// сбоку и сам текст. Обе страницы отличаются только содержимым sections.
export function LegalDocumentPage({
  doc,
  sections,
}: {
  doc: LegalDocument;
  sections: LegalSection[];
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

        <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          <LegalToc sections={sections} />
          <Card className="print-no-shadow px-6 py-8 sm:px-10 sm:py-10">
            <LegalBody sections={sections} />
          </Card>
        </div>
      </div>
    </SiteShell>
  );
}
