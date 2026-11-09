"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { ClientPortal } from "@/components/ui/client-portal";
import { usePresence } from "@/components/ui/use-presence";
import { supportFaqQuestions } from "@/lib/support-assistant/faq";
import { cn } from "@/lib/utils";

// Плавающий виджет AI-поддержки сервиса okno.business. Отвечает на вопросы
// владельцев аккаунтов/мастеров о том, как пользоваться сервисом (тарифы,
// настройка, фичи) — это НЕ AI-консультант для клиентов мастера по услугам,
// у той фичи (если появится) будет свой отдельный виджет и своя логика.
//
// Переписка живёт в localStorage, и это не удобство, а условие честности:
// когда бот передаёт вопрос живому специалисту, он обещает «ответ придёт
// сюда». Виджет висит в общем каркасе страницы, переход между лендингом и
// кабинетом его перемонтирует — без хранилища обещанному ответу было бы
// некуда прийти.
//
// Но живёт ровно сутки. Вечная переписка ломала две вещи сразу: чат никогда
// больше не был пустым, поэтому кнопки с частыми вопросами не возвращались
// после первого же сообщения, и в промпт уезжал контекст недельной давности.

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /**
   * Варианты уточняющих вопросов от бота — приходят, когда вопрос был
   * непонятен. Рисуются кнопками под сообщением, чтобы пользователь выбирал
   * тему нажатием, а не переформулировал вопрос сам.
   */
  suggestions?: string[];
  /**
   * Реплика живого специалиста, а не бота. Помечается, чтобы модель не
   * приняла чужой ответ про конкретный аккаунт за собственные слова и не
   * повторяла его как факт о сервисе.
   */
  fromOperator?: boolean;
};

/** Обращение, разговор по которому ещё не закрыт. */
type PendingEscalation = {
  id: string;
  /**
   * Время последней показанной реплики специалиста. В коротком диалоге он
   * пишет несколько раз, а поле с текстом на сервере одно — по этой метке
   * виджет отличает новый ответ от уже показанного.
   */
  lastSeenAnswerAt: string | null;
  /**
   * Ждём ли ответа прямо сейчас. Это НЕ то же самое, что «обращение открыто»:
   * после ответа специалиста ветка живёт ещё 15 минут под возможное
   * уточнение, но ждёт в этот момент уже он, а не мы. Пока эти два состояния
   * были склеены, «Ждём ответа специалиста» крутилось поверх пришедшего
   * ответа.
   */
  awaitingOperator: boolean;
};

type StoredChat = {
  messages: ChatMessage[];
  pendingEscalations: PendingEscalation[];
  /**
   * Дата последнего сообщения пользователя в его собственном часовом поясе,
   * в виде «2026-08-12». Решает две вещи: здоровается ли бот первым и не пора
   * ли начать переписку заново.
   *
   * Считается здесь, а не на сервере, по трём причинам: виджет и так хранит
   * переписку у себя, для гостей не нужен отдельный visitor id, и дата
   * получается в настоящем часовом поясе пользователя, а не сервера.
   */
  lastMessageDate: string | null;
};

const MAX_MESSAGE_LENGTH = 2000;
const STORAGE_KEY = "okno.support-chat";
// Больше двадцати реплик в хранилище держать незачем: в промпт всё равно
// уходит десяток последних.
const MAX_STORED_MESSAGES = 20;
const ESCALATION_POLL_MS = 6000;
// Через полчаса опрос прекращаем: ответ никуда не денется, он подхватится при
// следующем открытии страницы. Вечный таймер в фоне — плохая плата за это.
const ESCALATION_POLL_LIMIT_MS = 30 * 60 * 1000;

function localDateKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

function readStoredChat(): StoredChat | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredChat>;
    if (!Array.isArray(parsed.messages)) {
      return null;
    }

    return {
      messages: parsed.messages.filter(
        (message): message is ChatMessage =>
          Boolean(message) &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string",
      ),
      pendingEscalations: Array.isArray(parsed.pendingEscalations)
        ? parsed.pendingEscalations
            .filter(
              (item): item is PendingEscalation =>
                Boolean(item) && typeof item.id === "string",
            )
            .map((item) => ({
              ...item,
              // В переписке, сохранённой прошлой версией виджета, поля нет.
              // Первый же опрос статуса поставит настоящее значение.
              awaitingOperator: item.awaitingOperator ?? true,
            }))
        : [],
      lastMessageDate:
        typeof parsed.lastMessageDate === "string" ? parsed.lastMessageDate : null,
    };
  } catch {
    // Битое или недоступное хранилище (приватный режим, чужой ключ) не должно
    // ронять виджет — просто начнём переписку заново.
    return null;
  }
}

function writeStoredChat(value: StoredChat) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        messages: value.messages.slice(-MAX_STORED_MESSAGES),
        pendingEscalations: value.pendingEscalations,
        lastMessageDate: value.lastMessageDate,
      }),
    );
  } catch {
    // Переполненное или отключённое хранилище — не повод прерывать переписку.
  }
}

// Готовые вопросы кнопками — и на старте чата (частые вопросы), и под
// ответом, когда бот не понял вопрос и предлагает варианты.
function SuggestionChips({
  items,
  onSelect,
}: {
  items: string[];
  onSelect: (question: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className="rounded-full border border-line bg-surface px-3 py-2 text-left text-xs leading-5 text-ink transition hover:bg-panel active:scale-[0.98]"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function SupportChatWidget({ raised = false }: { raised?: boolean }) {
  const [open, setOpen] = useState(false);
  const presence = usePresence(open, 240);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEscalations, setPendingEscalations] = useState<PendingEscalation[]>([]);
  const [lastMessageDate, setLastMessageDate] = useState<string | null>(null);
  // Пока переписка не поднята из хранилища, писать в него нельзя: пустой
  // стартовый стейт затёр бы ожидающие обращения.
  const [isRestored, setIsRestored] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  useEffect(() => {
    const stored = readStoredChat();

    if (stored) {
      // Переписка прошлого дня не восстанавливается: чат начинается заново, с
      // кнопками частых вопросов. Ожидающие обращения переживают сброс всегда
      // — специалист мог ответить ночью, и этот ответ обещан.
      const isSameDay = stored.lastMessageDate === localDateKey();

      // eslint-disable-next-line react-hooks/set-state-in-effect -- правило ужесточилось в eslint-plugin-react-hooks 7.1; код рабочий, разбор без спешки отдельно
      setMessages(isSameDay ? stored.messages : []);
      setPendingEscalations(stored.pendingEscalations);
      setLastMessageDate(stored.lastMessageDate);
    }

    setIsRestored(true);
  }, []);

  useEffect(() => {
    if (isRestored) {
      writeStoredChat({ messages, pendingEscalations, lastMessageDate });
    }
  }, [isRestored, messages, pendingEscalations, lastMessageDate]);

  // Опрос обращений, переданных специалисту. Первый запрос уходит сразу при
  // монтировании — так ответ, написанный, пока страница была закрыта, находит
  // мастера при возвращении, а не через интервал.
  useEffect(() => {
    if (pendingEscalations.length === 0) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    async function pollOne(escalation: PendingEscalation) {
      try {
        const response = await fetch(`/api/support-chat/escalation/${escalation.id}`, {
          cache: "no-store",
        });

        // Сессия кончилась или обращение подчистили по сроку хранения — ждать
        // больше нечего, иначе виджет будет стучаться в никуда вечно.
        if (response.status === 403 || response.status === 404) {
          if (!cancelled) {
            setPendingEscalations((current) =>
              current.filter((item) => item.id !== escalation.id),
            );
          }
          return;
        }

        const data = (await response.json().catch(() => null)) as
          | {
              status?: string;
              reply?: string | null;
              answeredAt?: string | null;
              isOpen?: boolean;
            }
          | null;

        if (cancelled || !data) {
          return;
        }

        // Статус ведём независимо от текста: мастер мог дописать в ветку, и
        // тогда ждём снова, хотя прошлый ответ специалиста уже показан.
        const awaitingOperator = data.status === "pending";
        setPendingEscalations((current) =>
          current.map((item) =>
            item.id === escalation.id && item.awaitingOperator !== awaitingOperator
              ? { ...item, awaitingOperator }
              : item,
          ),
        );

        if (!data.reply || !data.answeredAt) {
          return;
        }

        // Тот же ответ, что уже показан, — новой реплики нет.
        if (data.answeredAt === escalation.lastSeenAnswerAt) {
          return;
        }

        setMessages((current) => [
          ...current,
          { role: "assistant", content: data.reply as string, fromOperator: true },
        ]);

        setPendingEscalations((current) =>
          // Разговор ещё открыт — специалист может написать снова, поэтому
          // обращение остаётся в списке с новой меткой. Закрыт — убираем.
          data.isOpen
            ? current.map((item) =>
                item.id === escalation.id
                  ? {
                      ...item,
                      lastSeenAnswerAt: data.answeredAt ?? null,
                      awaitingOperator: false,
                    }
                  : item,
              )
            : current.filter((item) => item.id !== escalation.id),
        );

        scrollToBottom();
      } catch {
        // Сеть моргнула — попробуем на следующем тике.
      }
    }

    function pollAll() {
      for (const escalation of pendingEscalations) {
        void pollOne(escalation);
      }
    }

    pollAll();

    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > ESCALATION_POLL_LIMIT_MS) {
        window.clearInterval(timer);
        return;
      }

      pollAll();
    }, ESCALATION_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingEscalations]);

  // Отправка вынесена из обработчика формы, потому что тот же путь
  // используют кнопки частых вопросов и уточняющих вариантов.
  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) {
      return;
    }

    // Флаг считаем ДО записи сегодняшней даты: иначе первое же сообщение
    // за день само себя объявит не первым.
    const today = localDateKey();
    const isFirstMessageToday = lastMessageDate !== today;

    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setLastMessageDate(today);
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
          isFirstMessageToday,
          // В историю уходит текст и пометка авторства — suggestions нужны
          // виджету, а не модели, и тратить на них токены незачем.
          history: messages.slice(-12).map((entry) => ({
            role: entry.role,
            content: entry.content,
            fromOperator: entry.fromOperator,
          })),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            reply?: string;
            suggestions?: string[];
            escalationId?: string;
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
          suggestions: data.suggestions?.length ? data.suggestions : undefined,
        },
      ]);

      if (data.escalationId) {
        const escalationId = data.escalationId;
        setPendingEscalations((current) =>
          current.some((item) => item.id === escalationId)
            ? current
            : [
                ...current,
                { id: escalationId, lastSeenAnswerAt: null, awaitingOperator: true },
              ],
        );
      }

      scrollToBottom();
    } catch {
      setError("Не получилось связаться с поддержкой. Проверь интернет-соединение.");
    } finally {
      setIsSending(false);
    }
  }

  function handleSend(event: React.FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  // Кнопки показываем только под последним сообщением: варианты из старой
  // переписки уже неактуальны и только засоряют чат.
  const lastMessage = messages.at(-1);
  const activeSuggestions =
    !isSending && lastMessage?.role === "assistant" ? lastMessage.suggestions : undefined;

  // Статус живёт в шапке, как в мессенджерах: «печатает» под именем
  // собеседника, а не отдельной строкой в ленте. В ленте он выглядел как
  // сообщение и оставался висеть под уже пришедшим ответом.
  const isAwaitingOperator = pendingEscalations.some((item) => item.awaitingOperator);
  const statusLine = isSending
    ? "Печатает…"
    : isAwaitingOperator
      ? "Специалист отвечает…"
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Закрыть чат поддержки" : "Открыть чат поддержки"}
        className={cn(
          "fixed right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-ink transition hover:-translate-y-0.5 active:scale-95",
          // В кабинете снизу стоит панель вкладок, и кнопка легла бы прямо на
          // неё — приподнимаем ровно на её высоту.
          raised
            ? "bottom-[calc(4.25rem+env(safe-area-inset-bottom)+var(--browser-toolbar-overlap))] md:bottom-5"
            : "bottom-5",
          // На мобильном чат раскрывается во весь экран и сам себе шапка с
          // крестиком — плавающая кнопка поверх него только мешала бы.
          open ? "max-sm:hidden" : "",
        )}
        style={{
          backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
          color: "var(--ui-primary-text)",
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {presence.mounted ? (
        <ClientPortal>
          {/* Затемнение: без него панель сливалась со страницей, особенно на
              светлых экранах кабинета. Клик по подложке закрывает чат — так же
              устроены остальные всплывающие панели в проекте. */}
          <button
            type="button"
            aria-label="Закрыть чат"
            onClick={() => setOpen(false)}
            data-state={presence.state}
            // Чёрный, а не оттенок чернил из палитры: на тёмной теме тот
            // сливался с фоном страницы и затемнения не было видно вовсе.
            // Чистый чёрный с прозрачностью затемняет обе темы одинаково.
            className="morph-scrim fixed inset-0 z-40 bg-[rgba(0,0,0,0.4)]"
          />

          <div
            role="dialog"
            aria-label="Чат поддержки okno.business"
            data-state={presence.state}
            // Окно растёт из плавающей кнопки в правом нижнем углу.
            style={{ "--morph-origin": "bottom right" } as React.CSSProperties}
            className={cn(
              "morph-panel fixed z-50 flex flex-col overflow-hidden border-line bg-surface",
              // Мобильный: шторка во весь экран. Инструкция из пяти шагов в
              // окошке 380×560 читалась в щель.
              "inset-0 rounded-none border-0",
              // Десктоп: плавающее окно, но заметно просторнее прежнего.
              "sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(680px,80vh)] sm:w-[min(440px,92vw)] sm:rounded-nested sm:border sm:shadow-ink",
            )}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Поддержка okno.business</p>
                {statusLine ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-accent-deep">
                    <Loader2 size={12} className="animate-spin" />
                    {statusLine}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted">
                    Вопросы по тарифам и настройке сервиса
                  </p>
                )}
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
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-ink-soft">
                    Чем помочь?
                  </p>
                  <SuggestionChips items={supportFaqQuestions} onSelect={sendMessage} />
                </div>
              ) : null}

              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-field px-3 py-2 text-sm leading-6",
                    message.role === "user"
                      ? "ml-auto"
                      : "border border-line bg-surface text-ink-soft",
                  )}
                  // Акцентная пара, а не bg-panel: в тёмной теме панель и
                  // поверхность диалога почти совпадают, и пузырь пропадал.
                  style={
                    message.role === "user"
                      ? {
                          backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
                          color: "var(--ui-primary-text, #ffffff)",
                        }
                      : undefined
                  }
                >
                  {message.fromOperator ? (
                    <span className="mb-1 block text-xs font-medium text-accent-deep">
                      Специалист
                    </span>
                  ) : null}
                  {message.content}
                </div>
              ))}

              {activeSuggestions ? (
                <SuggestionChips items={activeSuggestions} onSelect={sendMessage} />
              ) : null}

              {error ? (
                <p className="rounded-field border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
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
                // Плейсхолдер в одну строку: поле высотой в одну строку
                // обрезало длинную подсказку на половине слова.
                placeholder="Спроси про тарифы или настройки"
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH}
                className="min-h-11 flex-1 resize-none rounded-field border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ink/40"
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
