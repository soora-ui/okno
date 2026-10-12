import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/config/legal";
import { privacyPreamble, privacySections } from "@/content/legal/privacy";

const doc = getLegalDocument("privacy");

export const metadata: Metadata = {
  alternates: { canonical: "/legal/privacy" },
  title: "Политика в отношении обработки персональных данных — okno",
  description: doc.description,
  robots: doc.status === "draft" ? { index: false, follow: true } : undefined,
};

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      doc={doc}
      sections={privacySections}
      intro={privacyPreamble}
    />
  );
}
