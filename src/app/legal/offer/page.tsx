import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/config/legal";
import { offerSections } from "@/content/legal/offer";

const doc = getLegalDocument("offer");

export const metadata: Metadata = {
  title: "Публичная оферта — okno",
  description: doc.description,
  // Черновик редакции в поиске не нужен: индексируем только вступивший в силу
  // документ, иначе выдача цепляется за текст с незаполненными реквизитами.
  robots: doc.status === "draft" ? { index: false, follow: true } : undefined,
};

export default function OfferPage() {
  return <LegalDocumentPage doc={doc} sections={offerSections} />;
}
