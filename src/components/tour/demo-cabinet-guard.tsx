"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";

type Toast = { key: number; title: string };

/** Что показать после «отправки» формы — по надписи на нажатой кнопке. */
function toastFor(submitter: HTMLElement | null) {
  const label = submitter?.textContent?.trim().toLowerCase() ?? "";
  if (label.includes("проверить связь")) return "Тестовое сообщение отправлено";
  if (label.includes("заблокировать")) return "Время заблокировано";
  return "Изменения сохранены";
}

/**
 * Демо-кабинет только на чтение: формы здесь не уходят на сервер (их и так
 * отклоняет proxy — src/proxy.ts), а вместо этого показываем «сохранено».
 * Тур нажимает «Сохранить» как настоящий мастер и получает понятный ответ,
 * а настоящие данные — и анонимного посетителя, и залогиненного мастера —
 * не трогаются.
 *
 * Перехват на window в фазе захвата: срабатывает раньше обработчика React
 * на корне, поэтому серверное действие формы даже не запускается.
 */
export function DemoCabinetGuard() {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setToast({ key: Date.now(), title: toastFor(event.submitter) });
    };
    window.addEventListener("submit", onSubmit, true);
    return () => window.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex justify-center px-4 md:bottom-8">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.key}
            data-demo-toast
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-3 shadow-hover"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft">
              <Check size={16} className="text-success" />
            </span>
            <span className="text-sm">
              <span className="block font-medium text-ink">{toast.title}</span>
              <span className="block text-xs text-muted">Это демо — настоящие данные не меняются</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
