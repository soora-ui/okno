import type { Metadata } from "next";
import { LegalArchivePage } from "@/components/legal/legal-archive-page";
import { getLegalDocument } from "@/config/legal";

const doc = getLegalDocument("rules");

export const metadata: Metadata = {
  title: "Архив редакций правил использования Сервиса — okno",
  description:
    "Предыдущие редакции правил использования сервиса okno.business с указанием периода действия.",
};

export default function RulesArchivePage() {
  return <LegalArchivePage doc={doc} />;
}
