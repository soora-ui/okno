"use client";

import { useActionState, useState } from "react";
import { Bug, Lightbulb } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { cn } from "@/lib/utils";

const kinds = [
  {
    value: "idea",
    label: "Идея",
    icon: Lightbulb,
    placeholder:
      "Чего не хватает? Опиши, как бы ты этим пользовался — так нам проще понять задачу.",
  },
  {
    value: "bug",
    label: "Что-то не работает",
    icon: Bug,
    placeholder: "Что делал, что ожидал увидеть и что получилось вместо этого?",
  },
] as const;

export function FeedbackForm() {
  const [state, action] = useActionState(submitFeedbackAction, { success: false, message: "" });
  const [kind, setKind] = useState<(typeof kinds)[number]["value"]>("idea");
  // Поле контролируемое: при ошибке текст не должен пропадать, а после
  // успешной отправки — должен. Сброс делаем при смене ответа экшена.
  const [message, setMessage] = useState("");
  const [handledState, setHandledState] = useState(state);
  if (handledState !== state) {
    setHandledState(state);
    if (state.success) setMessage("");
  }
  const current = kinds.find((item) => item.value === kind) ?? kinds[0];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="path" value="/feedback" />
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {kinds.map((item) => {
          const selected = item.value === kind;
          return (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(item.value)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm transition active:scale-[0.98]",
                selected ? "border-ink text-white" : "border-line text-ink hover:bg-panel",
              )}
              style={selected ? { backgroundColor: "var(--color-ink)" } : undefined}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          );
        })}
      </div>
      <textarea
        name="message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={5}
        maxLength={2000}
        required
        placeholder={current.placeholder}
        className="w-full rounded-nested border border-line px-4 py-3 text-sm text-ink outline-none transition"
        style={{ backgroundColor: "var(--ui-field-bg)" }}
      />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel="Отправить команде" pendingLabel="Отправляю..." />
    </form>
  );
}
