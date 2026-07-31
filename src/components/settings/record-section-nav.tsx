"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionStatus = "complete" | "warning" | "none";

export type RecordSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  status: SectionStatus;
  content: ReactNode;
};

function StatusBadge({ status, withLabel }: { status: SectionStatus; withLabel?: boolean }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <Check size={14} />
        {withLabel ? <span className="text-xs font-medium">Готово</span> : null}
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <TriangleAlert size={14} />
        {withLabel ? <span className="text-xs font-medium">Требует внимания</span> : null}
      </span>
    );
  }
  return null;
}

export function RecordSectionNav({ sections }: { sections: RecordSection[] }) {
  return (
    <>
      <DesktopSidebarLayout sections={sections} />
      <MobileAccordion sections={sections} />
    </>
  );
}

function DesktopSidebarLayout({ sections }: { sections: RecordSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const active = sections.find((section) => section.id === activeId) ?? sections[0];

  return (
    <div className="hidden gap-6 md:flex">
      <nav className="w-64 shrink-0 self-start space-y-1 rounded-nested border border-line bg-surface p-2">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === active?.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveId(section.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-field border-l-[3px] px-3 py-3 text-left text-sm transition",
                isActive
                  ? "border-accent-deep bg-panel font-medium text-ink"
                  : "border-transparent text-ink-soft hover:bg-panel/60 hover:text-ink",
              )}
            >
              <Icon size={16} className={isActive ? "text-accent-deep" : "text-muted"} />
              <span className="flex-1">{section.label}</span>
              <StatusBadge status={section.status} />
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1 space-y-6">{active?.content}</div>
    </div>
  );
}

function MobileAccordion({ sections }: { sections: RecordSection[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-3 md:hidden">
      {sections.map((section) => {
        const Icon = section.icon;
        const isOpen = section.id === openId;
        return (
          <div
            key={section.id}
            className="overflow-hidden rounded-panel border border-line bg-surface"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : section.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-4 text-left"
            >
              <Icon size={16} className="text-muted" />
              <span className="flex-1 text-sm font-medium text-ink">{section.label}</span>
              <StatusBadge status={section.status} />
              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
              >
                <ChevronDown size={16} className="text-muted" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.28,
                    ease: "easeInOut",
                  }}
                  className="overflow-hidden"
                >
                  <div className="space-y-6 px-4 pb-4">{section.content}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
