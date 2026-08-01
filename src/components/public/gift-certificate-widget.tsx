"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Download, Gift, QrCode, ShieldCheck, X } from "lucide-react";
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

/**
 * Модалка со скачиванием после оплаты.
 *
 * Раньше на месте формы просто отрисовывалась карточка «Сертификат оплачен».
 * Покупатель возвращался из ЮKassa на длинную страницу мастера и оказывался
 * наверху — про то, что внизу лежит кнопка скачивания, догадывались не все.
 * Модалка перехватывает внимание сразу и закрыть её можно только осознанно.
 */
function CertificateDownloadModal({
  masterName,
  href,
  onClose,
}: {
  masterName: string;
  href: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Фон не должен уезжать под модалкой.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="certificate-paid-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,24,20,0.55)] p-4 backdrop-blur-sm sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-md space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Gift size={20} className="text-accent-deep" />
            <h2 id="certificate-paid-title" className="text-xl font-semibold text-ink">
              Сертификат оплачен
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-panel hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm leading-6 text-ink-soft">
          Скачай PDF — на нём есть QR-код, который {masterName} отсканирует при
          погашении. Файл можно переслать тому, кому даришь.
        </p>

        <a
          href={href}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-ink-contrast transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <Download size={16} />
          Скачать сертификат (PDF)
        </a>

        <p className="text-xs leading-5 text-muted">
          Ссылка на скачивание живёт в адресной строке этой вкладки. Скачай файл
          сейчас — так его точно не придётся искать.
        </p>
      </Card>
    </div>
  );
}

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

  const paid = Boolean(returnedCertificateId && returnedCertificateToken);
  const [isModalOpen, setIsModalOpen] = useState(paid);

  const downloadHref = paid
    ? `/api/certificates/${returnedCertificateId}/download?t=${returnedCertificateToken}`
    : "";

  const serviceOptions = [
    { value: "", label: "На любую услугу" },
    ...services.map((service) => ({ value: service.id, label: service.title })),
  ];

  // Оплаченное состояние: форма покупки уже не нужна, вместо неё — карточка
  // со скачиванием (на случай, если модалку закрыли) и сама модалка.
  if (paid) {
    return (
      <>
        <Card className="grid gap-6 lg:grid-cols-2 lg:items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Gift size={20} className="text-accent-deep" />
              <h2 className="text-xl font-semibold text-ink">Сертификат оплачен</h2>
            </div>
            <p className="text-sm leading-6 text-ink-soft">
              Скачай PDF с QR-кодом — {masterName} отсканирует его при погашении.
            </p>
          </div>
          <a
            href={downloadHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-ink-contrast transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <Download size={16} />
            Скачать сертификат (PDF)
          </a>
        </Card>

        {isModalOpen ? (
          <CertificateDownloadModal
            masterName={masterName}
            href={downloadHref}
            onClose={() => setIsModalOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    // Две колонки во всю ширину контента: раньше виджет был max-w-2xl и
    // висел узкой полосой под широкой страницей.
    <Card className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Gift size={20} className="text-accent-deep" />
          <h2 className="text-xl font-semibold text-ink">Подарочный сертификат</h2>
        </div>
        <p className="text-sm leading-6 text-ink-soft">
          Оплати онлайн — сразу после оплаты откроется скачивание PDF-сертификата
          с QR-кодом. Подарок можно использовать при записи к {masterName}.
        </p>

        <ul className="space-y-3 text-sm leading-6 text-ink-soft">
          <li className="flex items-start gap-3">
            <QrCode size={17} className="mt-0.5 shrink-0 text-accent-deep" />
            PDF с уникальным QR-кодом — его можно переслать или распечатать.
          </li>
          <li className="flex items-start gap-3">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-accent-deep" />
            Оплата проходит через ЮKassa мастера, деньги идут напрямую ему.
          </li>
        </ul>
      </div>

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
                aria-pressed={value === amount}
                className={cn(
                  "min-h-11 touch-manipulation rounded-full border px-4 py-2 text-sm font-medium transition active:scale-[0.98]",
                  value === amount
                    ? "border-ink bg-ink text-ink-contrast"
                    : "border-line bg-[var(--ui-field-bg)] text-ink hover:bg-panel",
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
          label="Почта"
          name="purchaserEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          hint="Продублируем сертификат на почту — на случай, если вкладка закроется."
        />

        <Input
          label="Телефон (необязательно)"
          name="purchaserContact"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 978 000-00-00"
          hint="Нужен только на случай спорных ситуаций."
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
