import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalDocument } from "@/config/legal";
import { cookiePreamble, cookieSections } from "@/content/legal/cookie";

const doc = getLegalDocument("cookie");

export const metadata: Metadata = {
  title: "Политика обработки файлов cookie — okno",
  description: doc.description,
  robots: doc.status === "draft" ? { index: false, follow: true } : undefined,
};

export default function CookiePage() {
  return (
    <LegalDocumentPage
      doc={doc}
      sections={cookieSections}
      intro={cookiePreamble}
    />
  );
}
