"use client";

import { useState, useTransition } from "react";
import { updateCertificateSalesEnabledAction } from "@/app/actions/settings";
import { FormMessage } from "@/components/forms/auth-form-state";
import { cn } from "@/lib/utils";

// Hard-gate тумблер (okno-tz-certificates-ui-flow.md, 2.3): пока нет
// сгенерированного дизайна (hasTemplate=false), клик не переключает
// продажу, а открывает модалку дизайна — тумблер физически не может быть
// включен без шаблона. Настоящая защита всё равно на сервере
// (updateCertificateSalesEnabledAction проверяет certificate_templates
// заново) — здесь только UX, чтобы не бить по API вслепую.
export function CertificateSalesToggle({
  enabled: initialEnabled,
  hasTemplate,
  onRequireDesign,
}: {
  enabled: boolean;
  hasTemplate: boolean;
  onRequireDesign: () => void;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const handleClick = () => {
    if (!hasTemplate) {
      onRequireDesign();
      return;
    }

    const next = !enabled;
    setMessage("");
    startTransition(async () => {
      const result = await updateCertificateSalesEnabledAction({ enabled: next });
      if (result.success) {
        setEnabled(next);
      } else {
        setMessage(result.message);
      }
    });
  };

  const looksDisabled = !hasTemplate;

  return (
    <div className="space-y-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-disabled={looksDisabled}
        title={looksDisabled ? "Нужен дизайн сертификата, чтобы включить продажу" : undefined}
        onClick={handleClick}
        disabled={pending}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
          looksDisabled ? "cursor-not-allowed border-line bg-panel opacity-60" : "border-line bg-surface",
        )}
      >
        <span className="text-sm font-medium text-ink">Включить продажу сертификатов</span>
        <span
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            enabled ? "bg-ink" : "bg-line",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
              enabled ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </span>
      </button>
      {looksDisabled ? (
        <p className="text-xs text-muted">Нужен дизайн сертификата, чтобы включить продажу.</p>
      ) : null}
      {message ? <FormMessage message={message} success={false} /> : null}
    </div>
  );
}
