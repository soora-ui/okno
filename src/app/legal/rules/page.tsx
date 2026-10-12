import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/config/legal";
import { rulesPreamble, rulesSections } from "@/content/legal/rules";

const doc = getLegalDocument("rules");

export const metadata: Metadata = {
  alternates: { canonical: "/legal/rules" },
  title: "Правила использования Сервиса — okno",
  description: doc.description,
  robots: doc.status === "draft" ? { index: false, follow: true } : undefined,
};

export default function RulesPage() {
  return (
    <LegalDocumentPage
      doc={doc}
      sections={rulesSections}
      intro={rulesPreamble}
    />
  );
}
