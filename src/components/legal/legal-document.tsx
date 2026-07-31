import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  formatLegalDate,
  getArchivedLegalEditions,
  getCurrentLegalEdition,
  legalSubprocessors,
  type LegalDocument,
} from "@/config/legal";
import { cn } from "@/lib/utils";

// Пункт документа. Нумерация не хранится в тексте, а считается при рендере:
// иначе вставка одного пункта в середину заставляет перенумеровывать вручную
// и ломает перекрёстные ссылки.
export type LegalClause = {
  text: ReactNode;
  items?: ReactNode[];
  // Подпункты нумеруются (1.2.3.) вместо маркеров списка.
  ordered?: boolean;
  // Блок после пункта — таблица или врезка. Отдельно от text, потому что
  // таблицу нельзя положить внутрь абзаца.
  after?: ReactNode;
};

export type LegalSection = {
  title: string;
  intro?: ReactNode;
  clauses: LegalClause[];
};

export const legalSectionAnchor = (index: number) => `p${index + 1}`;

// Место под реквизит, который ещё не определён. Показываем пропуск явно:
// пустое место в договоре читатель заметит, а выдуманный ИНН — нет.
export function LegalPending({ children }: { children: ReactNode }) {
  return (
    <span
      className="mx-0.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.9em] font-medium"
      style={{
        backgroundColor: "var(--color-warning-soft)",
        color: "var(--color-warning)",
      }}
    >
      {children}
    </span>
  );
}

// Реквизит из src/config/legal.ts. Пока значение пустое — на его месте стоит
// подпись пропуска; как только конфиг заполнят, текст документа подставит
// значение сам, без правки самого документа.
export function LegalValue({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  if (value) {
    return <>{value}</>;
  }

  return <LegalPending>{children}</LegalPending>;
}

export function LegalDraftNotice({ doc }: { doc: LegalDocument }) {
  if (doc.status !== "draft") {
    return null;
  }

  return (
    <Card
      className="print-avoid-break space-y-2 border-0 shadow-none"
      style={{ backgroundColor: "var(--color-warning-soft)" }}
    >
      <p className="text-base font-semibold text-ink">Редакция готовится</p>
      <p className="text-sm leading-6 text-ink-soft">
        Текст опубликован для ознакомления. Пропуски в жёлтых рамках — реквизиты
        и сведения, которые вносятся при публикации: до этого момента документ
        не является офертой и не порождает обязательств сторон.
      </p>
    </Card>
  );
}

export function LegalDocumentHeader({ doc }: { doc: LegalDocument }) {
  const edition = getCurrentLegalEdition(doc);
  const hasArchive = getArchivedLegalEditions(doc).length > 0;
  const dateLabel =
    doc.status === "draft"
      ? "Планируемая дата вступления в силу"
      : "Действует с";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="accent">Редакция {edition.version}</Badge>
        {doc.status === "draft" ? (
          <Badge tone="warning">Черновик</Badge>
        ) : null}
      </div>
      <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
        {doc.title}
      </h1>
      <p className="max-w-3xl text-base leading-7 text-ink-soft">
        {doc.description}
      </p>
      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">
            {dateLabel}
          </dt>
          <dd className="mt-1 text-base text-ink">
            {formatLegalDate(edition.effectiveFrom)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">
            Предыдущие редакции
          </dt>
          <dd className="mt-1 text-base">
            <Link
              href={doc.archiveHref}
              className="text-ink underline underline-offset-4 transition hover:text-accent-deep"
            >
              {hasArchive ? "Архив редакций" : "Архив пуст"}
            </Link>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function LegalToc({ sections }: { sections: LegalSection[] }) {
  return (
    <nav
      aria-label="Содержание документа"
      className="print-hidden space-y-3 lg:sticky lg:top-28"
    >
      <p className="text-xs uppercase tracking-[0.18em] text-muted">
        Содержание
      </p>
      <ol className="space-y-2">
        {sections.map((section, index) => (
          <li key={section.title} className="flex gap-2 text-sm leading-6">
            <span className="tabular-nums text-muted">{index + 1}.</span>
            <a
              href={`#${legalSectionAnchor(index)}`}
              className="text-ink-soft transition hover:text-ink"
            >
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function LegalClauseItems({
  clause,
  number,
}: {
  clause: LegalClause;
  number: string;
}) {
  const items = clause.items;

  if (!items?.length) {
    return null;
  }

  if (clause.ordered) {
    return (
      <ol className="mt-2 space-y-2 pl-6">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2 text-base leading-7 text-ink-soft">
            <span className="shrink-0 tabular-nums text-muted">
              {number}
              {index + 1}.
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ul className="mt-2 space-y-2 pl-6">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-base leading-7 text-ink-soft">
          <span
            aria-hidden
            className="mt-3 h-1 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--color-line)" }}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function LegalBody({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="space-y-12">
      {sections.map((section, sectionIndex) => (
        <section
          key={section.title}
          id={legalSectionAnchor(sectionIndex)}
          className="scroll-mt-28 space-y-4"
        >
          <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <span className="tabular-nums text-muted">{sectionIndex + 1}.</span>{" "}
            {section.title}
          </h2>
          {section.intro ? (
            <p className="text-base leading-7 text-ink-soft">{section.intro}</p>
          ) : null}
          <div className="space-y-4">
            {section.clauses.map((clause, clauseIndex) => {
              const number = `${sectionIndex + 1}.${clauseIndex + 1}.`;

              return (
                <div key={clauseIndex} className="print-avoid-break">
                  <p className="text-base leading-7 text-ink-soft">
                    <span className="mr-2 tabular-nums font-medium text-muted">
                      {number}
                    </span>
                    {clause.text}
                  </p>
                  <LegalClauseItems clause={clause} number={number} />
                  {clause.after ? <div className="mt-4">{clause.after}</div> : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// Таблица внешних сервисов: одна и та же в политике и в оферте, данные — из
// src/config/legal.ts, чтобы список субпроцессоров не разъезжался между
// документами при подключении нового сервиса.
export function LegalSubprocessorTable() {
  return (
    <div className="overflow-x-auto rounded-panel border border-line">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr style={{ backgroundColor: "var(--color-panel)" }}>
            <th className="px-4 py-3 font-medium text-ink">Сервис</th>
            <th className="px-4 py-3 font-medium text-ink">Назначение</th>
            <th className="px-4 py-3 font-medium text-ink">Какие данные</th>
          </tr>
        </thead>
        <tbody>
          {legalSubprocessors.map((subprocessor, index) => (
            <tr
              key={subprocessor.name}
              className={cn(index > 0 && "border-t border-line")}
            >
              <td className="px-4 py-3 align-top font-medium text-ink">
                {subprocessor.name}
              </td>
              <td className="px-4 py-3 align-top leading-6 text-ink-soft">
                {subprocessor.purpose}
              </td>
              <td className="px-4 py-3 align-top leading-6 text-ink-soft">
                {subprocessor.data}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
