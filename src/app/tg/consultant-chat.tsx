"use client";

import { useCallback, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { RepeatVisitOffer } from "@/lib/service-consultant/types";

// Консультант по услуге прямо в карточке визита.
//
// Ходит в тот же /api/service-consultation, что и виджет на странице записи:
// логика, мануал мастера и проверка тарифа там уже есть, дублировать нечего.
// Отличается только оболочка — внутри мини-аппа отдельная страница была бы
// лишним переходом, поэтому диалог разворачивается прямо в карточке.
//
// Услугу определяет токен записи, а не то, что прислал клиент: иначе по чужому
// токену можно было бы подставить любую услугу.

type Message = { role: "user" | "assistant"; content: string };

type ConsultantReply = {
  reply?: string;
  showMedicalDisclaimer?: boolean;
  repeatVisit?: RepeatVisitOffer | null;
  error?: string;
};

const maxHistory = 8;

export function ConsultantChat({ token }: { token: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disclaimer, setDisclaimer] = useState(false);
  const [offer, setOffer] = useState<RepeatVisitOffer | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async () => {
    const message = draft.trim();

    if (!message || busy) {
      return;
    }

    setBusy(true);
    setError("");
    setDraft("");
    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/service-consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          token,
          // Хвост переписки, чтобы модель понимала уточняющие вопросы.
          // Длину ограничивает и сервер, здесь режем заранее.
          history: messages.slice(-maxHistory),
        }),
      });

      const payload = (await response.json()) as ConsultantReply;

      if (payload.error || !payload.reply) {
        setError(payload.error ?? "Не получилось получить ответ. Попробуй ещё раз.");
        return;
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.reply as string },
      ]);
      setDisclaimer(Boolean(payload.showMedicalDisclaimer));
      setOffer(payload.repeatVisit ?? null);
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } catch {
      setError("Нет связи. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [busy, draft, messages, token]);

  return (
    <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
      {messages.length === 0 ? (
        <p className="text-sm leading-6" style={{ color: "var(--color-muted)" }}>
          Спроси про уход после процедуры — отвечу по мануалу мастера. Если ответа в нём
          нет, так и скажу.
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.map((message, index) => (
            <li
              key={`${message.role}-${index}`}
              className="rounded-nested px-3 py-2 text-sm leading-6"
              style={{
                backgroundColor:
                  message.role === "user" ? "var(--color-panel-strong)" : "var(--ui-field-bg)",
                color: "var(--color-ink)",
              }}
            >
              {message.content}
            </li>
          ))}
        </ul>
      )}

      {disclaimer ? (
        <p className="text-xs leading-5" style={{ color: "var(--color-muted)" }}>
          Это не медицинская рекомендация. При боли, отёке или температуре — к врачу.
        </p>
      ) : null}

      {offer ? (
        <div className="space-y-2 rounded-nested p-3" style={{ backgroundColor: "var(--ui-field-bg)" }}>
          <p className="text-sm leading-6" style={{ color: "var(--color-ink)" }}>
            Ближайшее время — {offer.dateLabel}: {offer.times.join(", ")}
          </p>
          <ButtonLink
            href={`https://okno.business/${offer.username}/book?service=${offer.serviceId}&date=${offer.date}`}
            variant="secondary"
            documentNavigation
          >
            Записаться
          </ButtonLink>
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Например: можно ли мочить?"
          className="min-h-11 flex-1 rounded-field border px-3 text-sm outline-none"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--ui-field-bg)",
            color: "var(--color-ink)",
          }}
        />
        <Button onClick={() => void send()} disabled={busy || !draft.trim()} className="px-4">
          <Send size={16} />
        </Button>
      </div>

      {error ? (
        <p className="text-sm leading-6" style={{ color: "var(--color-warning)" }}>
          {error}
        </p>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
