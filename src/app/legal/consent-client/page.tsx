import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { Card } from "@/components/ui/card";
import { getLegalDocument } from "@/config/legal";
import {
  blankClientConsentOperator,
  consentClientPreamble,
  consentClientSections,
} from "@/content/legal/consent-client";

const doc = getLegalDocument("consent-client");

export const metadata: Metadata = {
  alternates: { canonical: "/legal/consent-client" },
  title: "Согласие на обработку персональных данных клиента — okno",
  description: doc.description,
  // Шаблон с незаполненными реквизитами оператора в выдаче не нужен: клиент
  // должен попасть на согласие конкретного мастера со страницы записи.
  robots: { index: false, follow: true },
};

// На общей странице реквизиты оператора не подставлены — их место занимают
// пропуски. На публичной странице записи те же секции рендерятся с профилем
// конкретного мастера.
const sections = consentClientSections(blankClientConsentOperator);

export default function ConsentClientPage() {
  return (
    <LegalDocumentPage
      doc={doc}
      sections={sections}
      intro={consentClientPreamble}
      notice={
        <Card
          className="print-avoid-break space-y-2 border-0 shadow-none"
          style={{ backgroundColor: "var(--color-panel)" }}
        >
          <p className="text-base font-semibold text-ink">Это шаблон</p>
          <p className="text-sm leading-6 text-ink-soft">
            Оператором персональных данных клиента является сам мастер, а
            okno — обработчик по его поручению. Поэтому наименование, ОГРНИП,
            ИНН, адрес и контакты оператора подставляются из профиля мастера в
            момент показа формы записи. Здесь на их месте стоят пропуски.
          </p>
        </Card>
      }
    />
  );
}
