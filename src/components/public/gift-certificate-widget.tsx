"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CreditCard, Download, Gift, Loader2, X } from "lucide-react";
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
import {
  DemoCertificatePreview,
  type DemoCertificateDesign,
} from "@/components/certificates/demo-certificate-preview";

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
  /**
   * Демо (тур базы знаний): покупка без ЮKassa и без записи в базу —
   * оплата имитируется, а сертификат рисуется на странице.
   */
  demo?: { design: DemoCertificateDesign };
};

/**
 * Общая оболочка модалки: затемнение, блокировка прокрутки фона, Escape и
 * клик по подложке. Используется и формой покупки, и экраном скачивания.
 */
function CertificateModal({
  title,
  titleId,
  onClose,
  children,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
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
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(22,24,20,0.55)] p-4 backdrop-blur-sm sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card className="max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Gift size={20} className="text-accent-deep" />
            <h2 id={titleId} className="text-xl font-semibold text-ink">
              {title}
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
        {children}
      </Card>
    </div>
  );
}

export function GiftCertificateWidget(props: GiftCertificateWidgetProps) {
  return props.demo ? (
    <DemoGiftCertificateWidget {...props} design={props.demo.design} />
  ) : (
    <LiveGiftCertificateWidget {...props} />
  );
}

function CertificateShowcase({
  denominations,
  onPick,
}: {
  denominations: number[];
  onPick: (amount: number) => void;
}) {
  return (
    <>
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
        Подарочные сертификаты
      </p>

      <div data-certificates className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {denominations.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            className="card-hover flex flex-col items-center justify-center gap-3 rounded-section border border-transparent px-6 py-10 text-center transition active:scale-[0.98]"
            style={{ backgroundColor: "var(--color-accent-soft)" }}
          >
            <span className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {formatCurrency(value)}
            </span>
            <span className="text-sm font-medium uppercase tracking-[0.18em] text-accent-deep">
              Купить
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function DemoGiftCertificateWidget({
  masterName,
  denominations,
  services,
  design,
}: GiftCertificateWidgetProps & { design: DemoCertificateDesign }) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [step, setStep] = useState<"form" | "paying" | "processing" | "paid">("form");
  const [email, setEmail] = useState("");

  const serviceOptions = [
    { value: "", label: "На любую услугу" },
    ...services.map((service) => ({ value: service.id, label: service.title })),
  ];

  const close = () => {
    setSelectedAmount(null);
    setStep("form");
  };

  const pay = () => {
    setStep("processing");
    setTimeout(() => setStep("paid"), 1600);
  };

  return (
    <div className="space-y-6">
      <CertificateShowcase denominations={denominations} onPick={setSelectedAmount} />

      {selectedAmount !== null ? (
        <CertificateModal
          title={step === "paid" ? "Сертификат оплачен" : `Сертификат на ${formatCurrency(selectedAmount)}`}
          titleId="certificate-demo-title"
          onClose={close}
        >
          {step === "form" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setEmail(String(new FormData(event.currentTarget).get("purchaserEmail") ?? ""));
                setStep("paying");
              }}
            >
              {services.length > 0 ? (
                <Select label="Услуга" name="serviceId" options={serviceOptions} />
              ) : null}
              <Input
                label="Почта"
                name="purchaserEmail"
                type="email"
                inputMode="email"
                required
                placeholder="you@example.com"
              />
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-ink-contrast transition active:scale-[0.98]"
              >
                Оплатить {formatCurrency(selectedAmount)}
              </button>
            </form>
          ) : step === "paid" ? (
            <div className="space-y-4">
              <div className="text-[13px]">
                <DemoCertificatePreview
                  design={design}
                  masterName={masterName}
                  amount={selectedAmount}
                  code="OKNO-5K7Q-2M"
                />
              </div>
              <p className="text-sm leading-6 text-ink-soft">
                На сертификате QR-код — {masterName} отсканирует его при погашении. Файл
                можно переслать тому, кому даришь.
              </p>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-ink-contrast"
              >
                <Download size={16} />
                Скачать сертификат (PDF)
              </button>
            </div>
          ) : (
            <div data-demo-payment className="space-y-4">
              <div className="space-y-3 rounded-panel border border-line bg-panel p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <CreditCard size={16} />
                  Оплата картой
                </div>
                <div className="rounded-field border border-line bg-surface px-3 py-2.5 font-mono text-sm text-ink">
                  2200 •••• •••• 4242
                </div>
                <div className="grid grid-cols-2 gap-3 font-mono text-sm text-ink">
                  <div className="rounded-field border border-line bg-surface px-3 py-2.5">12 / 29</div>
                  <div className="rounded-field border border-line bg-surface px-3 py-2.5">•••</div>
                </div>
                {email ? <p className="text-xs text-muted">Чек придёт на {email}</p> : null}
              </div>
              <button
                type="button"
                onClick={pay}
                disabled={step === "processing"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-ink-contrast transition active:scale-[0.98] disabled:opacity-80"
              >
                {step === "processing" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Проводим оплату…
                  </>
                ) : (
                  `Оплатить ${formatCurrency(selectedAmount)}`
                )}
              </button>
              <p className="text-center text-xs text-muted">Это демо — деньги не списываются</p>
            </div>
          )}
        </CertificateModal>
      ) : null}
    </div>
  );
}

function LiveGiftCertificateWidget({
  username,
  masterName,
  denominations,
  services,
  returnedCertificateId,
  returnedCertificateToken,
}: GiftCertificateWidgetProps) {
  const [state, action] = useActionState(purchaseGiftCertificateAction, initialState);

  // Номинал выбирается кликом по карточке — он же открывает форму. Пока
  // номинал не выбран, форма не показывается вовсе: витрина остаётся
  // чистой сеткой сумм.
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);

  const paid = Boolean(returnedCertificateId && returnedCertificateToken);
  const [isDownloadOpen, setIsDownloadOpen] = useState(paid);

  const downloadHref = paid
    ? `/api/certificates/${returnedCertificateId}/download?t=${returnedCertificateToken}`
    : "";

  const serviceOptions = [
    { value: "", label: "На любую услугу" },
    ...services.map((service) => ({ value: service.id, label: service.title })),
  ];

  // Оплаченное состояние: витрина номиналов уже не нужна, вместо неё —
  // карточка со скачиванием (на случай, если модалку закрыли) и сама модалка.
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

        {isDownloadOpen ? (
          <CertificateModal
            title="Сертификат оплачен"
            titleId="certificate-paid-title"
            onClose={() => setIsDownloadOpen(false)}
          >
            <p className="text-sm leading-6 text-ink-soft">
              Скачай PDF — на нём есть QR-код, который {masterName} отсканирует при
              погашении. Файл можно переслать тому, кому даришь.
            </p>
            <a
              href={downloadHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-ink-contrast transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <Download size={16} />
              Скачать сертификат (PDF)
            </a>
            <p className="text-xs leading-5 text-muted">
              Ссылка на скачивание живёт в адресной строке этой вкладки. Скачай файл
              сейчас — так его точно не придётся искать.
            </p>
          </CertificateModal>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <CertificateShowcase denominations={denominations} onPick={setSelectedAmount} />

      {selectedAmount !== null ? (
        <CertificateModal
          title={`Сертификат на ${formatCurrency(selectedAmount)}`}
          titleId="certificate-purchase-title"
          onClose={() => setSelectedAmount(null)}
        >
          <form action={action} className="space-y-4">
            <input type="hidden" name="username" value={username} />
            <input type="hidden" name="amount" value={selectedAmount} />

            {services.length > 0 ? (
              <Select label="Услуга" name="serviceId" options={serviceOptions} />
            ) : null}

            <Input
              label="Почта"
              name="purchaserEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />

            <Input
              label="Телефон (необязательно)"
              name="purchaserContact"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7 978 000-00-00"
            />

            <FormMessage message={state.message} success={state.success} />
            <SubmitButton
              idleLabel={`Оплатить ${formatCurrency(selectedAmount)}`}
              pendingLabel="Переходим к оплате..."
              className="w-full justify-center"
            />
          </form>
        </CertificateModal>
      ) : null}
    </div>
  );
}
