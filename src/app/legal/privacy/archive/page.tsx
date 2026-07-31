import type { Metadata } from "next";
import { LegalArchivePage } from "@/components/legal/legal-archive-page";
import { getLegalDocument } from "@/config/legal";

const doc = getLegalDocument("privacy");

export const metadata: Metadata = {
  title: "Архив редакций политики обработки персональных данных — okno",
  description:
    "Предыдущие редакции политики в отношении обработки персональных данных okno.business с указанием периода действия.",
};

export default function PrivacyArchivePage() {
  return <LegalArchivePage doc={doc} />;
}
