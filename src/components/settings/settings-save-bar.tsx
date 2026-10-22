"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { DEMO_SUBMIT_EVENT } from "@/components/tour/demo-mode";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const formSelector = "form[data-settings-form]";

// Значения формы одной строкой. Файлы не сравниваем: аватар и работы
// загружаются сразу, мимо общей кнопки.
function serialize(form: HTMLFormElement) {
  return JSON.stringify(
    [...new FormData(form)].filter(([, value]) => typeof value === "string"),
  );
}

/**
 * Общее сохранение для карточек настроек. Каждая форма с data-settings-form
 * по-прежнему отправляет свой server action, но кнопки у неё спрятаны:
 * панель сравнивает текущие значения с теми, что были при открытии, и
 * отправляет только изменённые формы.
 *
 * Сравниваем значения, а не ловим «был ввод»: вернул поле как было — и
 * изменений снова нет. Это же работает для контролов на собственном state
 * (переключатели дней, пресеты темы): их скрытые инпуты попадают в FormData.
 */
export function useSettingsSave(containerRef: RefObject<HTMLElement | null>) {
  const snapshots = useRef(new WeakMap<HTMLFormElement, string>());
  const inFlight = useRef(new Map<HTMLFormElement, number>());
  const failed = useRef(false);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const forms = useCallback(
    () => [
      ...(containerRef.current?.querySelectorAll<HTMLFormElement>(
        formSelector,
      ) ?? []),
    ],
    [containerRef],
  );

  const dirtyForms = useCallback(
    () =>
      forms().filter((form) => {
        const saved = snapshots.current.get(form);
        return saved !== undefined && saved !== serialize(form);
      }),
    [forms],
  );

  const recount = useCallback(
    () => setDirtyCount(dirtyForms().length),
    [dirtyForms],
  );

  // Исходное состояние формы запоминаем в момент, когда с ней начинают
  // работать: фокус, нажатие, клавиша приходят раньше изменения, но уже
  // после того, как компоненты дозаполнили поля в эффектах (город,
  // часовой пояс). Снимок при вставке в DOM этого не видел.
  const rememberBaseline = useCallback((target: EventTarget | null) => {
    const form =
      target instanceof Element ? target.closest<HTMLFormElement>(formSelector) : null;
    if (form && !snapshots.current.has(form)) {
      snapshots.current.set(form, serialize(form));
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onInteractionStart = (event: Event) => rememberBaseline(event.target);
    // Карточки уходят из DOM при переключении разделов — пересчитываем.
    const observer = new MutationObserver(() => recount());
    observer.observe(container, { childList: true, subtree: true });

    // После клика React успевает перерисовать контролы на state, поэтому
    // сравниваем на следующем тике.
    let timer = 0;
    const scheduleRecount = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(recount, 0);
    };

    // Любая отправка — и с общей кнопки, и по Enter в поле — ждёт ответа.
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.matches(formSelector)) {
        if (inFlight.current.size === 0) failed.current = false;
        inFlight.current.set(form, Date.now());
        setStatus("saving");
      }
    };

    container.addEventListener("focusin", onInteractionStart, true);
    container.addEventListener("pointerdown", onInteractionStart, true);
    container.addEventListener("keydown", onInteractionStart, true);
    // Тур по базе знаний «нажимает» одним click, без pointerdown.
    container.addEventListener("click", onInteractionStart, true);
    container.addEventListener("input", scheduleRecount);
    container.addEventListener("change", scheduleRecount);
    container.addEventListener("click", scheduleRecount);
    container.addEventListener("submit", onSubmit);
    // В демо-кабинете отправку глушит DemoCabinetGuard ещё на window, а
    // форме шлёт своё событие (без всплытия — ловим на захвате).
    container.addEventListener(DEMO_SUBMIT_EVENT, onSubmit, true);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      container.removeEventListener("focusin", onInteractionStart, true);
      container.removeEventListener("pointerdown", onInteractionStart, true);
      container.removeEventListener("keydown", onInteractionStart, true);
      container.removeEventListener("click", onInteractionStart, true);
      container.removeEventListener("input", scheduleRecount);
      container.removeEventListener("change", scheduleRecount);
      container.removeEventListener("click", scheduleRecount);
      container.removeEventListener("submit", onSubmit);
      container.removeEventListener(DEMO_SUBMIT_EVENT, onSubmit, true);
    };
  }, [containerRef, recount, rememberBaseline]);

  // Пока формы отправляются, следим за их кнопками: data-pending снимается,
  // когда server action ответил. Ответ с ошибкой виден по FormMessage.
  useEffect(() => {
    if (status !== "saving") return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      for (const [form, startedAt] of inFlight.current) {
        if (!form.isConnected) {
          inFlight.current.delete(form);
          continue;
        }
        if (now - startedAt < 200 || form.querySelector("[data-pending]"))
          return;
        if (form.querySelector('[data-form-message][data-success="false"]')) {
          failed.current = true;
        }
        inFlight.current.delete(form);
      }
      if (inFlight.current.size > 0) return;
      window.clearInterval(interval);
      // React после ответа сбрасывает форму к новым значениям с сервера —
      // запоминаем уже их.
      window.setTimeout(() => {
        for (const form of forms())
          snapshots.current.set(form, serialize(form));
        setDirtyCount(0);
        setStatus(failed.current ? "error" : "saved");
      }, 250);
    }, 120);
    return () => window.clearInterval(interval);
  }, [status, forms]);

  useEffect(() => {
    if (status !== "saved" && status !== "error") return;
    const timer = window.setTimeout(
      () => setStatus("idle"),
      status === "saved" ? 2500 : 6000,
    );
    return () => window.clearTimeout(timer);
  }, [status]);

  const save = () => {
    const changed = dirtyForms();
    if (changed.length === 0) return;
    // Сначала проверяем всё: иначе половина карточек сохранится, а
    // незаполненное обязательное поле в другой останется незамеченным.
    const invalid = changed.find((form) => !form.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    for (const form of changed) form.requestSubmit();
  };

  // Сбросить можно только перемонтированием: часть полей живёт в state
  // компонентов, и form.reset() их не вернёт. Перемонтирует вызывающий код.
  const afterDiscard = () => {
    setDirtyCount(0);
    setStatus("idle");
  };

  return { dirty: dirtyCount > 0, status, save, afterDiscard };
}

/** Спросить перед уходом со страницы, если есть несохранённые изменения. */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    // Переходы по ссылкам кабинета клиентские, beforeunload их не видит —
    // перехватываем клик раньше роутера.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank")
        return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (!window.confirm(unsavedQuestion)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

export const unsavedQuestion =
  "Есть несохранённые изменения. Уйти без сохранения?";

const statusText: Record<SaveStatus, string> = {
  idle: "Есть несохранённые изменения",
  saving: "Сохраняю…",
  saved: "Изменения сохранены",
  error: "Не всё сохранилось — смотри сообщения в карточках",
};

const dotColor: Record<SaveStatus, string> = {
  idle: "bg-[var(--color-warning)]",
  saving: "bg-[var(--color-muted)] animate-pulse",
  saved: "bg-[var(--color-success)]",
  error: "bg-[var(--color-danger)]",
};

export function SettingsSaveBar({
  dirty,
  status,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  status: SaveStatus;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const visible = dirty || status !== "idle";
  const busy = status === "saving";

  return (
    <>
      {/* На телефоне панель стоит над нижними вкладками и закрывала бы
          последнюю карточку — оставляем под ней место. */}
      {visible ? <div aria-hidden="true" className="h-16 lg:hidden" /> : null}
      <div
        role="region"
        aria-label="Сохранение изменений"
        className={cn(
          "z-30 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          // Телефон: полоса во всю ширину над нижними вкладками.
          "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom)+var(--browser-toolbar-overlap,0px))] max-lg:border-t max-lg:border-[var(--color-line)] max-lg:bg-[color-mix(in_srgb,var(--color-background)_92%,transparent)] max-lg:px-4 max-lg:py-3 max-lg:backdrop-blur md:max-lg:bottom-0",
          // Широкий экран: «пилюля» внизу колонки с формами.
          "lg:sticky lg:bottom-4 lg:rounded-full lg:border lg:border-[var(--color-line)] lg:bg-[var(--color-surface)] lg:py-2.5 lg:pl-6 lg:pr-2.5 lg:shadow-card",
          visible
            ? "opacity-100"
            : "pointer-events-none translate-y-4 opacity-0 max-lg:invisible lg:hidden",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            role="status"
            className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-ink max-lg:hidden"
          >
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", dotColor[status])}
            />
            {dirty && status !== "saving"
              ? statusText.idle
              : statusText[status]}
          </span>
          <div className="flex gap-2 max-lg:w-full">
            {dirty ? (
              <button
                type="button"
                onClick={onDiscard}
                disabled={busy}
                className="min-h-11 rounded-full px-5 text-sm font-medium text-ink transition hover:bg-[var(--color-panel)] disabled:opacity-50 max-lg:min-h-12 max-lg:border max-lg:border-[var(--color-line)] max-lg:bg-[var(--color-surface)] max-lg:text-[15px]"
              >
                Отменить
              </button>
            ) : null}
            <button
              type="button"
              data-tour="settings-save"
              onClick={onSave}
              disabled={!dirty || busy}
              style={{
                backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
                color: "var(--ui-primary-text)",
              }}
              className="min-h-11 rounded-full px-6 text-sm font-medium transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 max-lg:min-h-12 max-lg:flex-1 max-lg:text-[15px]"
            >
              {busy
                ? "Сохраняю…"
                : status === "saved" && !dirty
                  ? "Сохранено"
                  : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
