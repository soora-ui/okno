"use client";

import { useActionState, useState } from "react";
import { HeartHandshake } from "lucide-react";
import { startTipPaymentAction, type TipActionState } from "@/app/actions/tips";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import {
  tipAmountOptionsRub,
  tipMaxAmountRub,
  tipMinAmountRub,
} from "@/lib/tips";

const initialState: TipActionState = {
  success: false,
  message: "",
};

export function TipForm({ bookingId }: { bookingId: string }) {
  const [state, action] = useActionState(startTipPaymentAction, initialState);
  const [selected, setSelected] = useState<number>(tipAmountOptionsRub[1]);
  const [customAmount, setCustomAmount] = useState("");
  const isCustom = customAmount.trim().length > 0;
  const amount = isCustom ? Number(customAmount) : selected;
  const amountValid =
    Number.isInteger(amount) && amount >= tipMinAmountRub && amount <= tipMaxAmountRub;

  return (
    <div className="rounded-card bg-panel p-5 text-left">
      <div className="flex items-center gap-2">
        <HeartHandshake size={18} className="text-ink-soft" />
        <p className="font-medium text-ink">Оставить чаевые мастеру</p>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Понравился результат? Поддержи мастера чаевыми — оплата через ЮKassa.
      </p>

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="amount" value={amountValid ? amount : ""} />

        <div className="flex flex-wrap gap-2">
          {tipAmountOptionsRub.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSelected(option);
                setCustomAmount("");
              }}
              className="min-h-11 rounded-full border px-4 text-sm font-medium transition"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor:
                  !isCustom && selected === option
                    ? "var(--ui-primary-bg, var(--color-ink))"
                    : "var(--ui-field-bg)",
                color:
                  !isCustom && selected === option
                    ? "var(--ui-primary-text)"
                    : "var(--color-ink)",
              }}
            >
              {option} ₽
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-ink">Своя сумма, ₽</span>
          <input
            type="number"
            inputMode="numeric"
            min={tipMinAmountRub}
            max={tipMaxAmountRub}
            placeholder={`от ${tipMinAmountRub} до ${tipMaxAmountRub}`}
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            className="min-h-12 rounded-field border px-4 text-sm outline-none transition"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--ui-field-bg)",
              color: "var(--color-ink)",
            }}
          />
        </label>

        <FormMessage message={state.message} success={state.success} />

        <SubmitButton
          idleLabel={amountValid ? `Оставить ${amount} ₽` : "Оставить чаевые"}
          pendingLabel="Переходим к оплате..."
          disabled={!amountValid}
          className="w-full"
        />
      </form>
    </div>
  );
}
