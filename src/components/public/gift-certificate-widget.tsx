"use client";

import { useActionState, useState } from "react";
import { Gift } from "lucide-react";
import {
  purchaseGiftCertificateAction,
  type GiftCertificatePurchaseActionState,
} from "@/app/actions/gift-certificates";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/mock-data";
import type { Service } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const initialState: GiftCertificatePurchaseActionState = {
  success: false,
  message: "",
};

type GiftCertificateWidgetProps = {
  username: string;
  masterName: string;
  denominations: number[];
  services: Service[];
};

export function GiftCertificateWidget({
  username,
  masterName,
  denominations,
  services,
}: GiftCertificateWidgetProps) {
  const [state, action] = useActionState(purchaseGiftCertificateAction, initialState);
  const [amount, setAmount] = useState(denominations[0] ?? 0);

  const serviceOptions = [
    { value: "", label: "На любую услугу" },
    ...services.map((service) => ({ value: service.id, label: service.title })),
  ];

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3">
        <Gift size={20} className="text-accent-deep" />
        <h2 className="text-xl font-semibold text-ink">Подарочный сертификат</h2>
      </div>
      <p className="text-sm leading-6 text-ink-soft">
        Оплати онлайн — код сертификата придет тебе по SMS. Подарок можно
        использовать при записи к {masterName}.
      </p>

      <form action={action} className="space-y-4">
        <input type="hidden" name="username" value={username} />
        <input type="hidden" name="amount" value={amount} />

        <div className="space-y-2">
          <span className="text-sm font-medium text-ink">Номинал</span>
          <div className="flex flex-wrap gap-2">
            {denominations.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(value)}
                className={cn(
                  "touch-manipulation rounded-full border px-4 py-2 text-sm font-medium transition active:scale-[0.98]",
                  value === amount
                    ? "border-ink bg-ink text-ink-contrast"
                    : "border-line bg-[var(--ui-field-bg,#ffffff)] text-ink hover:bg-panel",
                )}
              >
                {formatCurrency(value)}
              </button>
            ))}
          </div>
        </div>

        {services.length > 0 ? (
          <Select
            label="На какую услугу"
            name="serviceId"
            options={serviceOptions}
            hint="Или оставь «На любую услугу» — сертификат подойдет к любой записи."
          />
        ) : null}

        <Input
          label="Телефон для доставки кода"
          name="purchaserContact"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 978 000-00-00"
          hint="Код сертификата придет SMS-сообщением сразу после оплаты."
          required
        />

        <FormMessage message={state.message} success={state.success} />
        <SubmitButton
          idleLabel={`Купить за ${formatCurrency(amount)}`}
          pendingLabel="Переходим к оплате..."
          className="w-full justify-center"
        />
      </form>
    </Card>
  );
}
