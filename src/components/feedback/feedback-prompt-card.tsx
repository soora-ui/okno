"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import {
  answerFeedbackPromptAction,
  dismissFeedbackPromptAction,
} from "@/app/actions/feedback";
import { FollowUpField, ReasonPicker } from "@/components/feedback/reason-picker";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { pulseQuestion, reasonsFor } from "@/lib/feedback/config";
import type { FeedbackPromptKind } from "@/lib/feedback/service";

const copy: Record<FeedbackPromptKind, { title: string; hint: string; followUp: string }> = {
  trial_ending: {
    title: "Пробный период скоро закончится",
    hint: "Что мешает остаться с okno? Одно касание — и мы узнаем, что поправить.",
    followUp: "Что бы сделало okno незаменимым для тебя? (необязательно)",
  },
  trial_ended: {
    title: "Почему не продолжил?",
    hint: "Пробный период закончился. Скажи честно — это поможет сделать сервис лучше.",
    followUp: "Расскажи подробнее (необязательно)",
  },
  pulse: {
    title: pulseQuestion,
    hint: "Один вопрос, раз в пару месяцев. Ответ видит только команда okno.",
    followUp: "Что одно нам стоит улучшить в первую очередь? (необязательно)",
  },
};

// Карточка опроса в кабинете. Не модалка: мастер открывает кабинет между
// клиентами, и окно поверх расписания его бы только раздражало. Карточку
// можно закрыть — тогда этот вопрос больше не появится.
export function FeedbackPromptCard({
  promptKey,
  kind,
}: {
  promptKey: string;
  kind: FeedbackPromptKind;
}) {
  const [state, action] = useActionState(answerFeedbackPromptAction, {
    success: false,
    message: "",
  });
  const [reason, setReason] = useState<string | null>(null);
  const reasons = reasonsFor(kind);
  const text = copy[kind];
  const followUp =
    reasons.find((item) => item.code === reason)?.followUp ?? text.followUp;

  if (state.success) {
    return (
      <div className="rounded-card border border-line bg-success-soft p-5">
        <p className="text-sm font-medium text-success">{state.message}</p>
      </div>
    );
  }

  return (
    <div
      className="relative space-y-4 rounded-card border border-line p-5 shadow-card"
      style={{ backgroundColor: "var(--ui-card-bg)" }}
    >
      <form action={dismissFeedbackPromptAction} className="absolute right-3 top-3">
        <input type="hidden" name="key" value={promptKey} />
        <button
          type="submit"
          aria-label="Не сейчас"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-panel hover:text-ink"
        >
          <X size={16} />
        </button>
      </form>

      <div className="space-y-1 pr-10">
        <p className="text-base font-semibold text-ink">{text.title}</p>
        <p className="text-sm leading-6 text-ink-soft">{text.hint}</p>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="key" value={promptKey} />
        <input type="hidden" name="kind" value={kind} />
        <ReasonPicker reasons={reasons} value={reason} onChange={setReason} />
        {reason ? (
          <>
            <FollowUpField placeholder={followUp} />
            <FormMessage message={state.message} success={state.success} />
            <SubmitButton idleLabel="Отправить" pendingLabel="Отправляю..." />
          </>
        ) : null}
      </form>
    </div>
  );
}
