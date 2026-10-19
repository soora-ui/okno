"use client";

import { useActionState } from "react";
import { type AdminActionState, updateFeedbackAction } from "@/app/actions/admin";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { type FeedbackStatus, feedbackStatusLabels, feedbackStatuses } from "@/lib/feedback/config";

const initialState: AdminActionState = { success: false, message: "" };

export function FeedbackReplyForm({
  id,
  status,
  adminReply,
  replySent,
}: {
  id: string;
  status: FeedbackStatus;
  adminReply: string | null;
  replySent: boolean;
}) {
  const [state, action] = useActionState(updateFeedbackAction, initialState);

  return (
    <form action={action} className="space-y-3 rounded-field bg-panel p-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-3">
        <select
          name="status"
          defaultValue={status}
          className="rounded-full border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          {feedbackStatuses.map((value) => (
            <option key={value} value={value}>
              {feedbackStatusLabels[value]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="notify" value="on" defaultChecked={!replySent} />
          Отправить ответ мастеру
        </label>
      </div>
      <textarea
        name="reply"
        rows={2}
        maxLength={2000}
        defaultValue={adminReply ?? ""}
        placeholder="Ответ мастеру: «Спасибо, сделали — загляни в настройки» или почему не будем"
        className="w-full rounded-nested border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
      />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel="Сохранить" pendingLabel="Сохраняю..." />
    </form>
  );
}
