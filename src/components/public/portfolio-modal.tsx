"use client";

import Image from "next/image";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/mock-data";

export function PortfolioModal({
  fullName,
  works,
  isOpen,
  onClose,
}: {
  fullName: string;
  works: Profile["portfolioWorks"];
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || works.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 px-3 py-5 sm:px-6 sm:py-8"
      style={{ backgroundColor: "rgba(25,26,23,0.3)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Галерея работ ${fullName}`}
        className="mx-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-section border border-line shadow-ink"
        style={{ backgroundColor: "var(--ui-card-bg)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-muted">
              Готовые работы
            </p>
            <h2 className="text-2xl font-semibold text-ink sm:text-3xl">{fullName}</h2>
            <p className="text-sm leading-6 text-ink-soft">
              Можно пролистать всю подборку, не уходя со страницы записи.
            </p>
          </div>
          <Button variant="secondary" onClick={onClose} className="px-4">
            Закрыть
          </Button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-2">
            {works.map((work, index) => (
              <article
                key={work.id}
                className="overflow-hidden rounded-card border border-line"
                style={{ backgroundColor: "var(--color-panel)" }}
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={work.imageUrl}
                    alt={`${fullName}, работа ${index + 1}`}
                    fill
                    sizes="(max-width: 639px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
                <div className="px-4 py-4">
                  <p className="text-sm font-medium text-ink">Работа {index + 1}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
