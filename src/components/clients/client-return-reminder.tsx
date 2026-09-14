"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  draftClientReturnReminderAction,
  sendClientReturnReminderAction,
  type ClientReturnActionState,
} from "@/app/actions/client-return";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Textarea } from "@/components/ui/textarea";

const initialState: ClientReturnActionState = { success: false, message: "" };

// Напоминание клиенту о себе из карточки. Два шага намеренно: черновик от ИИ
// появляется в поле, и только после правки (или без неё) уходит в Telegram.
// Один клик «сгенерировать и отправить» сэкономил бы секунду, но отправлял бы
// клиенту текст, которого мастер не видел.
export function ClientReturnReminder({
  clientId,
  clientName,
  reachable,
  lastRemindedLabel,
  due,
}: {
  clientId: string;
  clientName: string;
  reachable: boolean;
  lastRemindedLabel: string | null;
  due: boolean;
}) {
  const [draftState, draftAction] = useActionState(
    draftClientReturnReminderAction,
    initialState,
  );
  const [sendState, sendAction] = useActionState(
    sendClientReturnReminderAction,
    initialState,
  );
  // Без useEffect: черновик — производное от ответа action, правки мастера
  // лежат рядом и привязаны к конкретному черновику. Новый черновик (после
  // «Отменить» и повторного запроса) автоматически сбрасывает старые правки.
  const draft = draftState.draft ?? "";
  const draftId = draftState.draftId ?? null;
  const [edited, setEdited] = useState<{ draftId: string; text: string } | null>(null);
  const [dismissedDraftId, setDismissedDraftId] = useState<string | null>(null);
  const text = edited && edited.draftId === draftId ? edited.text : draft;
  const showEditor = Boolean(draftId) && dismissedDraftId !== draftId;

  if (!reachable) {
    return (
      <div className="rounded-panel border border-dashed border-line bg-surface px-4 py-3 text-sm leading-6 text-muted">
        {clientName} не подключал напоминания в Telegram, написать через бота нельзя.
        Клиент подключается сам — кнопкой «Напоминать в Telegram» на странице своей
        записи.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-ink-soft">
        {due
          ? "Клиент давно не был. ИИ составит короткое личное сообщение по истории визитов — ты его проверишь и отправишь в Telegram."
          : "Сообщение уйдёт клиенту в Telegram от твоего имени, с кнопкой записи."}
        {lastRemindedLabel ? ` Напоминали ${lastRemindedLabel}.` : ""}
      </p>

      {sendState.success ? (
        <FormMessage message={sendState.message} success />
      ) : (
        <>
          {!showEditor ? (
            <form action={draftAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <SubmitButton
                idleLabel="Составить сообщение"
                pendingLabel="Пишу..."
                className="gap-2"
              />
              <FormMessage message={draftState.success ? "" : draftState.message} />
            </form>
          ) : (
            <form action={sendAction} className="space-y-3">
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="draft" value={draft} />
              <Textarea
                label="Текст сообщения"
                name="text"
                value={text}
                onChange={(event) => setEdited({ draftId: draftId ?? "", text: event.currentTarget.value })}
                className="min-h-32"
                maxLength={600}
              />
              <p className="text-xs text-muted">
                <Sparkles size={12} className="mr-1 inline-block align-[-2px]" />
                {draftState.draftSource === "ai"
                  ? "Черновик написал ИИ по истории клиента — поправь, если что-то не так."
                  : "Это шаблон: ИИ сейчас недоступен. Поправь текст под клиента."}
              </p>
              <FormMessage message={sendState.message} success={sendState.success} />
              <div className="flex flex-wrap gap-3">
                <SubmitButton
                  idleLabel="Отправить в Telegram"
                  pendingLabel="Отправляю..."
                />
                <button
                  type="button"
                  onClick={() => {
                    setDismissedDraftId(draftId);
                    setEdited(null);
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-5 py-3 text-sm font-medium text-ink transition hover:-translate-y-0.5"
                >
                  Отменить
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
