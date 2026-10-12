import type { Metadata } from "next";
import { LegalArchivePage } from "@/components/legal/legal-archive-page";
import { getLegalDocument } from "@/config/legal";

const doc = getLegalDocument("offer");

export const metadata: Metadata = {
  alternates: { canonical: "/legal/offer/archive" },
  title: "Архив редакций публичной оферты — okno",
  description:
    "Предыдущие редакции публичной оферты okno.business с указанием периода действия.",
};

export default function OfferArchivePage() {
  return <LegalArchivePage doc={doc} />;
}
