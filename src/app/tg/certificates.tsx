"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

// Сертификаты в кабинете.
//
// Купленный на свой телефон появляется сам. Подаренный — только после ввода
// кода: получатель нигде не записан, о нём известно ровно то, что у него есть
// код. Поэтому форма ввода не «дополнительная возможность», а основной путь.

export type ClientCertificate = {
  id: string;
  code: string;
  masterName: string;
  masterUsername: string;
  amountRub: number;
  remainingRub: number;
  status: string;
  expiresAtIso: string | null;
  serviceTitle: string | null;
};

const statusLabels: Record<string, string> = {
  paid: "Оплачен",
  active: "Действует",
  redeemed: "Использован",
};

export function Certificates({
  initData,
  certificates,
  onClaimed,
}: {
  initData: string;
  certificates: ClientCertificate[];
  onClaimed: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const claim = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/telegram/miniapp/certificate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, code: code.trim() }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (payload.error || !payload.ok) {
        setError(payload.error ?? "Не получилось привязать сертификат.");
        return;
      }

      setCode("");
      setFormOpen(false);
      onClaimed();
    } catch {
      setError("Нет связи. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [code, initData, onClaimed]);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-ink">Сертификаты</h2>

      {certificates.length > 0 ? (
        <ul className="space-y-3">
          {certificates.map((certificate) => (
            <li key={certificate.id} className="rounded-card bg-panel p-5">
              <p className="font-medium text-ink">
                {certificate.serviceTitle ?? `Сертификат на ${certificate.amountRub} ₽`}
              </p>
              <p className="mt-1 text-sm text-ink-soft">{certificate.masterName}</p>
              <p className="mt-3 text-sm text-ink">
                {/* Частично потраченный сертификат: показываем остаток, а не
                    номинал — тратить можно только его. */}
                {certificate.remainingRub === certificate.amountRub
                  ? `${certificate.amountRub} ₽`
                  : `Остаток ${certificate.remainingRub} ₽ из ${certificate.amountRub} ₽`}
                {" · "}
                {statusLabels[certificate.status] ?? certificate.status}
              </p>
              <p
                className="mt-3 rounded-field border px-3 py-2 text-center text-sm font-medium"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--ui-field-bg)",
                  color: "var(--color-ink)",
                  userSelect: "all",
                  WebkitUserSelect: "all",
                }}
              >
                {certificate.code}
              </p>
              {certificate.expiresAtIso ? (
                <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
                  Действует до{" "}
                  {new Date(certificate.expiresAtIso).toLocaleDateString("ru-RU")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {formOpen ? (
        <div className="space-y-3 rounded-card border border-line p-5">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="OKNO-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            className="min-h-11 w-full rounded-field border px-3 text-sm outline-none"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--ui-field-bg)",
              color: "var(--color-ink)",
            }}
          />
          <Button
            onClick={() => void claim()}
            disabled={busy || code.trim().length < 4}
            className="w-full"
          >
            {busy ? "Проверяем…" : "Добавить"}
          </Button>
          {error ? (
            <p className="text-sm leading-6" style={{ color: "var(--color-warning)" }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setFormOpen(true)} className="w-full">
          {certificates.length > 0 ? "Добавить ещё сертификат" : "У меня есть сертификат"}
        </Button>
      )}
    </section>
  );
}
