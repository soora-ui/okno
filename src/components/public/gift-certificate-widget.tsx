"use client";

import { useActionState, useState } from "react";
import { Download, Gift } from "lucide-react";
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
  // После оплаты ЮKassa возвращает покупателя на эту же страницу с
  // ?certificate=<id>&ct=<token> (см. purchaseGiftCertificateAction) — это
  // единственный способ доказать право на скачивание PDF без аккаунта.
  // Читаем эти query-параметры на сервере (см. [username]/page.tsx) и
  // передаем пропом, а не через useSearchParams на клиенте — не нужна
  // Suspense-обёртка ради одного виджета.
  returnedCertificateId?: string;
  returnedCertificateToken?: string;
};

export function GiftCertificateWidget({
  username,
  masterName,
  denominations,
  services,
  returnedCertificateId,
  returnedCertificateToken,
}: GiftCertificateWidgetProps) {
  const [state, action] = useActionState(purchaseGiftCertificateAction, initialState);
  const [amount, setAmount] = useState(denominations[0] ?? 0);

  const serviceOptions = [
    { value: "", label: "На любую услугу" },
    ...services.map((service) => ({ value: service.id, label: service.title })),
  ];

  if (returnedCertificateId && returnedCertificateToken) {
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <Gift size={20} className="text-accent-deep" />
          <h2 className="text-xl font-semibold text-ink">Сертификат оплачен</h2>
        </div>
        <p className="text-sm leading-6 text-ink-soft">
          Скачай PDF с сертификатом — на нём есть QR-код, который {masterName} отсканирует при
          погашении.
        </p>
        <a
          href={`/api/certificates/${returnedCertificateId}/download?t=${returnedCertificateToken}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-contrast transition active:scale-[0.98]"
        >
          <Download size={16} />
          Скачать сертификат (PDF)
        </a>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3">
        <Gift size={20} className="text-accent-deep" />
        <h2 className="text-xl font-semibold text-ink">Подарочный сертификат</h2>
      </div>
      <p className="text-sm leading-6 text-ink-soft">
        Оплати онлайн — сразу после оплаты будет доступно скачивание PDF-сертификата с QR-кодом.
        Подарок можно использовать при записи к {masterName}.
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
          label="Телефон (необязательно)"
          name="purchaserContact"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 978 000-00-00"
          hint="Сертификат скачивается сразу после оплаты, телефон нужен только на случай спорных ситуаций."
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
