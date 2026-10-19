"use client";

import { useActionState, useState } from "react";
import { PauseCircle } from "lucide-react";
import {
  type FeedbackActionState,
  pauseSubscriptionAction,
  resumeSubscriptionAction,
} from "@/app/actions/feedback";
import { disableSubscriptionAutopayAction } from "@/app/actions/subscription";
import { ReasonPicker } from "@/components/feedback/reason-picker";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { cancelReasons, pauseOptions } from "@/lib/feedback/config";
import { cn } from "@/lib/utils";

const initialState: FeedbackActionState = { success: false, message: "" };

// Причины, при которых вместо отключения уместно предложить паузу: человеку
// не плохо с сервисом, ему сейчас просто не нужна запись.
const pauseFriendlyReasons = new Set(["seasonal", "pause", "expensive"]);

function PausePeriodPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Срок паузы">
      <input type="hidden" name="days" value={value} />
      {pauseOptions.map((option) => {
        const selected = option.days === value;

        return (
          <button
            key={option.days}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.days)}
            className={cn(
              "min-h-10 rounded-full border px-4 py-2 text-sm transition active:scale-[0.98]",
              selected ? "border-ink text-white" : "border-line text-ink hover:bg-panel",
            )}
            style={selected ? { backgroundColor: "var(--color-ink)" } : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PauseForm({
  reason,
  message,
  submitLabel,
}: {
  reason?: string | null;
  message?: string;
  submitLabel: string;
}) {
  const [state, action] = useActionState(pauseSubscriptionAction, initialState);
  const [days, setDays] = useState<number>(30);

  return (
    <form action={action} className="space-y-3">
      {reason ? <input type="hidden" name="reason" value={reason} /> : null}
      {message ? <input type="hidden" name="message" value={message} /> : null}
      <PausePeriodPicker value={days} onChange={setDays} />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel={submitLabel} pendingLabel="Ставлю на паузу..." />
    </form>
  );
}

// Отключение автопродления в два шага: сначала необязательный вопрос
// «почему», потом сама кнопка. Ответ не обязателен и отключение не
// блокирует — иначе это ловушка, а не опрос.
export function CancelAutopayFlow({ canPause }: { canPause: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [state, action] = useActionState(disableSubscriptionAutopayAction, initialState);
  const followUp =
    cancelReasons.find((item) => item.code === reason)?.followUp ??
    "Что могло бы тебя удержать? (необязательно)";
  const offerPause = canPause && reason !== null && pauseFriendlyReasons.has(reason);

  if (state.success) {
    return <FormMessage message={state.message} success />;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-ink-soft underline-offset-4 transition hover:text-ink hover:underline"
      >
        Отключить автопродление
      </button>
    );
  }

  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">Почему отключаешь?</p>
        <p className="text-xs leading-5 text-ink-soft">
          Необязательно, но очень поможет нам стать лучше.
        </p>
      </div>

      <ReasonPicker reasons={cancelReasons} value={reason} onChange={setReason} name="_reason" />

      {reason ? (
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={followUp}
          className="w-full rounded-nested border border-line px-4 py-3 text-sm text-ink outline-none transition"
          style={{ backgroundColor: "var(--ui-field-bg)" }}
        />
      ) : null}

      {offerPause ? (
        <div className="space-y-3 rounded-panel bg-panel p-4">
          <div className="flex items-start gap-3">
            <PauseCircle size={18} className="mt-0.5 shrink-0 text-accent-deep" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">Может, пауза вместо отключения?</p>
              <p className="text-xs leading-5 text-ink-soft">
                Заморозим подписку: оплаченные дни не сгорят, карта останется, а запись у
                клиентов закроется до конца паузы. Вернуться можно в любой момент.
              </p>
            </div>
          </div>
          <PauseForm reason={reason} message={message} submitLabel="Поставить на паузу" />
        </div>
      ) : null}

      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="reason" value={reason ?? ""} />
        <input type="hidden" name="message" value={message} />
        <FormMessage message={state.message} success={state.success} />
        <SubmitButton idleLabel="Отключить и отвязать карту" pendingLabel="Отключаю..." />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted transition hover:text-ink"
        >
          Передумал
        </button>
      </form>
    </div>
  );
}

// Карточка паузы в разделе подписки: либо «на паузе до…» с возвратом, либо
// свёрнутое предложение взять перерыв.
export function SubscriptionPauseCard({
  pausedUntilLabel,
  untilLabel,
  canPause,
}: {
  pausedUntilLabel: string | null;
  untilLabel: string | null;
  canPause: boolean;
}) {
  const [resumeState, resumeAction] = useActionState(resumeSubscriptionAction, initialState);

  if (pausedUntilLabel) {
    return (
      <div className="space-y-3 rounded-panel border border-line bg-warning-soft p-4">
        <p className="text-sm font-semibold text-ink">Подписка на паузе до {pausedUntilLabel}</p>
        <p className="text-xs leading-5 text-ink-soft">
          Клиенты пока не могут записаться онлайн — уже созданные записи остаются в силе.
          Оплаченные дни сохранены{untilLabel ? `: тариф действует до ${untilLabel}` : ""}.
          Вернёшься раньше — неиспользованные дни паузы тоже не пропадут.
        </p>
        <form action={resumeAction}>
          <FormMessage message={resumeState.message} success={resumeState.success} />
          <SubmitButton idleLabel="Вернуться раньше" pendingLabel="Снимаю паузу..." />
        </form>
      </div>
    );
  }

  if (!canPause) {
    return null;
  }

  return (
    <details className="group rounded-panel border border-line p-4">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-ink">
        <PauseCircle size={18} className="text-accent-deep" />
        Нужен перерыв? Поставь подписку на паузу
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-5 text-ink-soft">
          Отпуск, болезнь, межсезонье — заморозь подписку на срок от двух недель до трёх
          месяцев. Оплаченные дни не сгорят, а запись у клиентов закроется до конца паузы.
          Уже созданные записи остаются. За год можно провести на паузе до 90 дней.
        </p>
        <PauseForm submitLabel="Поставить на паузу" />
      </div>
    </details>
  );
}
