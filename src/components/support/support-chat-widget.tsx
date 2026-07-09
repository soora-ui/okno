"use client";

import { useRef, useState } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { ClientPortal } from "@/components/ui/client-portal";
import { cn } from "@/lib/utils";

// Плавающий виджет AI-поддержки сервиса okno.business. Отвечает на вопросы
// владельцев аккаунтов/мастеров о том, как пользоваться сервисом (тарифы,
// настройка, фичи) — это НЕ AI-консультант для клиентов мастера по услугам,
// у той фичи (если появится) будет свой отдельный виджет и своя логика.

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGE_LENGTH = 2000;

export function SupportChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsSending(true);
    scrollToBottom();

    try {
      const response = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-12),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { reply?: string; error?: string }
        | null;

      if (!response.ok || !data?.reply) {
        setError(data?.error ?? "Не получилось получить ответ. Попробуй ещё раз.");
        return;
      }

      setMessages((current) => [...current, { role: "assistant", content: data.reply as string }]);
      scrollToBottom();
    } catch {
      setError("Не получилось связаться с поддержкой. Проверь интернет-соединение.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Закрыть чат поддержки" : "Открыть чат поддержки"}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_16px_40px_rgba(28,31,27,0.25)] transition hover:-translate-y-0.5 active:scale-95"
        style={{
          backgroundColor: "var(--ui-primary-bg, var(--color-ink, #23241f))",
          color: "var(--ui-primary-text, #ffffff)",
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {open ? (
        <ClientPortal>
          <div
            role="dialog"
            aria-label="Чат поддержки okno.business"
            className="fixed bottom-24 right-5 z-40 flex h-[min(560px,70vh)] w-[min(380px,92vw)] flex-col overflow-hidden rounded-[24px] border border-line bg-surface shadow-[0_24px_80px_rgba(28,31,27,0.18)]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Поддержка okno.business</p>
                <p className="text-xs text-muted">Вопросы по тарифам и настройке сервиса</p>
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
                  Привет! Спроси меня о тарифах, о том, как настроить страницу записи, подключить
                  Telegram-уведомления или что-то ещё про работу с okno.business.
                </p>
              ) : null}

              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6",
                    message.role === "user" ? "ml-auto bg-panel text-ink" : "bg-white text-ink-soft border border-line",
                  )}
                >
                  {message.content}
                </div>
              ))}

              {isSending ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  Печатает...
                </div>
              ) : null}

              {error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}
            </div>

            <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-line p-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend(event);
                  }
                }}
                placeholder="Спроси про тарифы, настройку страницы записи..."
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH}
                className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-ink/40"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                aria-label="Отправить сообщение"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
                style={{
                  backgroundColor: "var(--ui-primary-bg, var(--color-ink, #23241f))",
                  color: "var(--ui-primary-text, #ffffff)",
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
