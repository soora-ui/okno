import type { Metadata } from "next";
import { LegalArchivePage } from "@/components/legal/legal-archive-page";
import { getLegalDocument } from "@/config/legal";

const doc = getLegalDocument("consent");

export const metadata: Metadata = {
  alternates: { canonical: "/legal/consent/archive" },
  title: "Архив редакций согласия на обработку персональных данных — okno",
  description:
    "Предыдущие редакции согласия на обработку персональных данных мастера с указанием периода действия.",
};

export default function ConsentArchivePage() {
  return <LegalArchivePage doc={doc} />;
}
