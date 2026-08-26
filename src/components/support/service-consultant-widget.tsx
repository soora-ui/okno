"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { ClientPortal } from "@/components/ui/client-portal";
import { consultantMaxUserMessageLength } from "@/lib/service-consultant/prompt";
import { cn } from "@/lib/utils";

// AI-консультант для КЛИЕНТОВ мастера: вопросы по конкретной услуге и уходу
// после неё. Отдельный компонент от виджета поддержки сервиса
// (support-chat-widget.tsx) — там собеседник мастер, есть эскалация на живого
// оператора и переписка живёт в localStorage.
//
// Открывается кнопкой в вёрстке страницы, а не плавающим пузырём в углу.
// Причина не только в том, что угол уже занят виджетом поддержки: пузырь
// висит поверх всего и требует внимания сам по себе, а консультант нужен в
// конкретный момент — когда клиент смотрит на услугу или на свою запись.
// Кнопка стоит там же, где этот момент наступает.
//
// Переписки в хранилище намеренно НЕТ. Хранить незачем: обещания «ответ придёт
// сюда» консультант не даёт, а вопросы вида «нормально ли, что второй день
// болит» — это про здоровье, и оставлять их лежать в браузере на общем
// устройстве не за чем.

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  showMedicalDisclaimer?: boolean;
  repeatVisit?: RepeatVisitOffer;
};

type RepeatVisitOffer = {
  date: string;
  dateLabel: string;
  times: string[];
  serviceId: string;
  username: string;
};

type Props = {
  /**
   * Токен записи. Есть — известна и услуга, и дата визита, поэтому консультант
   * может предложить записаться повторно. Так открывается со страницы записи.
   */
  token?: string;
  /** Услуга, о которой идёт разговор. Так открывается с карточки услуги. */
  serviceId?: string;
  /** Название услуги — показывается в шапке диалога. */
  serviceTitle: string;
  /** Подпись кнопки. По умолчанию — «Спросить про услугу». */
  label?: string;
};

// Кнопки времени для повторной записи. Клик уводит в обычный флоу записи:
// запись создаёт существующий код, который умеет и предоплату, и защиту от
// двойного бронирования. Консультант записывать не умеет и не должен.
function RepeatVisitChips({ offer }: { offer: RepeatVisitOffer }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{offer.dateLabel}</p>
      <div className="flex flex-wrap gap-2">
        {offer.times.map((time) => (
          <Link
            key={time}
            href={`/${offer.username}/book?service=${offer.serviceId}&date=${offer.date}&time=${time}`}
            className="rounded-full border border-line bg-surface px-3 py-2 text-xs leading-5 text-ink transition hover:bg-panel active:scale-[0.98]"
          >
            {time}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ServiceConsultantButton({
  token,
  serviceId,
  serviceTitle,
  label = "Спросить про услугу",
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const node = listRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    });
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    scrollToBottom();

    // Модальное окно закрывается с клавиатуры — иначе на узком экране, где
    // диалог занимает почти весь вьюпорт, выйти можно только точным попаданием
    // по крестику.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) {
      return;
    }

    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    setError(null);
    setIsSending(true);
    scrollToBottom();

    try {
      const response = await fetch("/api/service-consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          token,
          serviceId: token ? undefined : serviceId,
          history: messages
            .slice(-10)
            .map((entry) => ({ role: entry.role, content: entry.content })),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            reply?: string;
            showMedicalDisclaimer?: boolean;
            repeatVisit?: RepeatVisitOffer | null;
            error?: string;
          }
        | null;

      if (!response.ok || !data?.reply) {
        setError(data?.error ?? "Не получилось получить ответ. Попробуй ещё раз.");
        return;
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.reply as string,
          showMedicalDisclaimer: data.showMedicalDisclaimer,
          repeatVisit: data.repeatVisit ?? undefined,
        },
      ]);
      scrollToBottom();
    } catch {
      setError("Не получилось связаться с консультантом. Проверь интернет-соединение.");
    } finally {
      setIsSending(false);
    }
  }

  function handleSend(event: React.FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-panel active:scale-[0.98]"
      >
        <MessageCircle size={18} />
        {label}
      </button>

      {open ? (
        <ClientPortal>
          {/* Подложка закрывает диалог по клику мимо. Кнопка, а не div с
              onClick: так закрытие доступно и с клавиатуры, и скринридеру. */}
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-ink/20 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Чат с консультантом по услуге"
            className="fixed left-1/2 top-1/2 z-50 flex h-[min(560px,80vh)] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-nested border border-line bg-surface shadow-ink"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">{serviceTitle}</p>
                <p className="text-xs text-muted">Отвечаю по материалам мастера</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="rounded-full p-1.5 text-ink-soft transition hover:bg-panel"
              >
                <X size={18} />
              </button>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <p className="text-sm leading-6 text-ink-soft">
                  Спроси про уход после процедуры или про то, когда можно повторить.
                </p>
              ) : null}

              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className="space-y-2">
                  {/* Своё сообщение — акцентной парой токенов, той же, что у
                      первичных кнопок. Раньше это был bg-panel без рамки, и на
                      тёмных пресетах мастера пузырь пропадал: там --color-panel
                      и --color-surface диалога отличаются на пару единиц. */}
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-field px-3 py-2 text-sm leading-6",
                      message.role === "user"
                        ? "ml-auto"
                        : "border border-line bg-surface text-ink-soft",
                    )}
                    style={
                      message.role === "user"
                        ? {
                            backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
                            color: "var(--ui-primary-text, #ffffff)",
                          }
                        : undefined
                    }
                  >
                    {message.content}
                  </div>

                  {message.repeatVisit ? (
                    <RepeatVisitChips offer={message.repeatVisit} />
                  ) : null}

                  {/* Дисклеймер висит только под ответами по существу. Под
                      «мастер об этом не писал» он превращается в шум, а шум
                      перестают читать — и тогда он не работает и там, где нужен. */}
                  {message.showMedicalDisclaimer ? (
                    <p className="text-xs leading-5 text-muted">
                      Это не медицинская рекомендация. При тревожных симптомах — к
                      мастеру или врачу.
                    </p>
                  ) : null}
                </div>
              ))}

              {isSending ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  Печатает...
                </div>
              ) : null}

              {error ? (
                <p className="rounded-field border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}
            </div>

            <form
              onSubmit={handleSend}
              className="flex items-end gap-2 border-t border-line p-3"
            >
              <textarea
                value={input}
                onChange={(event) =>
                  setInput(event.target.value.slice(0, consultantMaxUserMessageLength))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend(event);
                  }
                }}
                placeholder={
                  "Например: когда можно мыть голову?"
                }
                rows={1}
                maxLength={consultantMaxUserMessageLength}
                className="min-h-11 flex-1 resize-none rounded-field border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ink/40 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                aria-label="Отправить сообщение"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
                style={{
                  backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
                  color: "var(--ui-primary-text)",
                }}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </ClientPortal>
      ) : null}
    </>
  );
}
