"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionStatus = "complete" | "warning" | "none";

export type RecordSection = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  status: SectionStatus;
  content: ReactNode;
};

export function SectionStatusMark({ status }: { status: SectionStatus }) {
  if (status === "complete") {
    return <Check size={14} className="text-success" aria-label="Готово" />;
  }
  if (status === "warning") {
    return (
      <TriangleAlert size={14} className="text-warning" aria-label="Требует внимания" />
    );
  }
  return null;
}

/** DOM-id карточки подраздела — на него ведёт навигация слева. */
export const recordSectionAnchor = (id: string) => `record-${id}`;

// Каждый подраздел рендерится один раз. На широком экране все они идут
// лентой, а навигация слева листает к нужному; на телефоне та же разметка
// складывается в аккордеон — строка-заголовок сверху, содержимое по нажатию.
// Раньше было две раскладки сразу, и формы монтировались дважды.
export function RecordSectionList({ sections }: { sections: RecordSection[] }) {
  const [openId, setOpenId] = useState<string | null>(sections[0]?.id ?? null);

  return (
    <div className="flex flex-col gap-3 lg:gap-6">
      {sections.map((section) => {
        const Icon = section.icon;
        const isOpen = section.id === openId;
        const panelId = `${recordSectionAnchor(section.id)}-panel`;

        return (
          <div
            key={section.id}
            id={recordSectionAnchor(section.id)}
            className={cn(
              "scroll-mt-28 max-lg:overflow-hidden max-lg:rounded-card max-lg:border max-lg:border-[var(--color-line)] max-lg:bg-[var(--color-surface)]",
              isOpen && "max-lg:shadow-card",
            )}
          >
            <div className="relative flex min-h-[72px] items-center gap-3 px-4 lg:hidden">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full text-ink",
                  isOpen ? "bg-accent" : "bg-panel",
                )}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold text-ink">
                  <button
                    type="button"
                    data-tour-section={section.id}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenId(isOpen ? null : section.id)}
                    className="text-left after:absolute after:inset-0 after:content-['']"
                  >
                    {section.label}
                  </button>
                </h3>
                <p className="mt-0.5 truncate text-[13px] text-muted">{section.hint}</p>
              </div>
              <SectionStatusMark status={section.status} />
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-muted transition-transform duration-300",
                  isOpen && "rotate-180",
                )}
              />
            </div>

            {/* На телефоне карточка подраздела становится телом аккордеона:
                снимаем с неё рамку, тень и фон, а заголовок уже есть в строке. */}
            <div
              id={panelId}
              className={cn(
                "max-lg:px-4 max-lg:pb-5",
                "max-lg:[&>*]:border-0! max-lg:[&>*]:bg-transparent! max-lg:[&>*]:p-0! max-lg:[&>*]:shadow-none!",
                "max-lg:[&_[data-settings-title]]:hidden",
                !isOpen && "max-lg:hidden",
              )}
            >
              {section.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
