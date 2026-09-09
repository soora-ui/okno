"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { tipAmountOptionsRub, tipMaxAmountRub, tipMinAmountRub } from "@/lib/tips";

// Чаевые за прошедший визит.
//
// Оплата открывается наружу через openLink: внутри вебвью Telegram платёжная
// страница ЮKassa ведёт себя непредсказуемо — 3-D Secure уводит в банковское
// приложение, а вернуться оттуда в мини-апп уже некуда.

type TipFormProps = {
  initData: string;
  bookingId: string;
  onOpenLink: (url: string) => void;
};

export function TipForm({ initData, bookingId, onOpenLink }: TipFormProps) {
  const [selected, setSelected] = useState<number>(tipAmountOptionsRub[1]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amount = custom.trim() ? Number(custom) : selected;
  const amountValid =
    Number.isInteger(amount) && amount >= tipMinAmountRub && amount <= tipMaxAmountRub;

  const pay = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/telegram/miniapp/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, bookingId, amount }),
      });

      const payload = (await response.json()) as {
        confirmationUrl?: string;
        error?: string;
      };

      if (payload.error || !payload.confirmationUrl) {
        setError(payload.error ?? "Не получилось начать оплату.");
        return;
      }

      onOpenLink(payload.confirmationUrl);
    } catch {
      setError("Нет связи. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [amount, bookingId, initData, onOpenLink]);

  return (
    <div
      className="mt-4 space-y-3 border-t pt-4"
      style={{ borderColor: "var(--color-line)" }}
    >
      <div className="flex flex-wrap gap-2">
        {tipAmountOptionsRub.map((option) => (
          <Button
            key={option}
            variant={!custom.trim() && selected === option ? "primary" : "secondary"}
            onClick={() => {
              setSelected(option);
              setCustom("");
            }}
          >
            {option} ₽
          </Button>
        ))}
      </div>
      <input
        value={custom}
        onChange={(event) => setCustom(event.target.value.replace(/\D/g, ""))}
        inputMode="numeric"
        placeholder="Своя сумма"
        className="min-h-11 w-full rounded-field border px-3 text-sm outline-none"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--ui-field-bg)",
          color: "var(--color-ink)",
        }}
      />
      <Button onClick={() => void pay()} disabled={!amountValid || busy} className="w-full">
        {busy ? "Открываем оплату…" : `Оставить ${amountValid ? `${amount} ₽` : "чаевые"}`}
      </Button>
      {error ? (
        <p className="text-sm leading-6" style={{ color: "var(--color-warning)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
