import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/config/legal";
import {
  offerAppendix,
  offerPreamble,
  offerSections,
} from "@/content/legal/offer";

const doc = getLegalDocument("offer");

export const metadata: Metadata = {
  alternates: { canonical: "/legal/offer" },
  title: "Публичная оферта — okno",
  description: doc.description,
  // Черновик редакции в поиске не нужен: индексируем только вступивший в силу
  // документ, иначе выдача цепляется за текст с незаполненными реквизитами.
  robots: doc.status === "draft" ? { index: false, follow: true } : undefined,
};

export default function OfferPage() {
  return (
    <LegalDocumentPage
      doc={doc}
      sections={offerSections}
      intro={offerPreamble}
      appendix={offerAppendix}
    />
  );
}
