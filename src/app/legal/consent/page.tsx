import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/config/legal";
import { consentPreamble, consentSections } from "@/content/legal/consent";

const doc = getLegalDocument("consent");

export const metadata: Metadata = {
  alternates: { canonical: "/legal/consent" },
  title: "Согласие на обработку персональных данных мастера — okno",
  description: doc.description,
  robots: doc.status === "draft" ? { index: false, follow: true } : undefined,
};

export default function ConsentPage() {
  return (
    <LegalDocumentPage
      doc={doc}
      sections={consentSections}
      intro={consentPreamble}
    />
  );
}
