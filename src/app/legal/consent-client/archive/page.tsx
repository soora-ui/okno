import type { Metadata } from "next";
import { LegalArchivePage } from "@/components/legal/legal-archive-page";
import { getLegalDocument } from "@/config/legal";

const doc = getLegalDocument("consent-client");

export const metadata: Metadata = {
  title: "Архив редакций согласия на обработку персональных данных клиента — okno",
  description:
    "Предыдущие редакции согласия на обработку персональных данных клиента мастера с указанием периода действия.",
};

export default function ConsentClientArchivePage() {
  return <LegalArchivePage doc={doc} />;
}
