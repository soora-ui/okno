"use client";

import { useState, useTransition } from "react";
import { updateCertificateSalesEnabledAction } from "@/app/actions/settings";
import { FormMessage } from "@/components/forms/auth-form-state";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Hard-gate тумблер (okno-tz-certificates-ui-flow.md, 2.3): пока нет
// сгенерированного дизайна (hasTemplate=false), клик не переключает
// продажу, а открывает модалку дизайна — тумблер физически не может быть
// включен без шаблона. Плюс продажу нельзя включить без подключенной
// ЮKassa мастера (деньги за сертификат идут в его магазин): без неё вместо
// вызова API показываем ошибку и кнопку «Подключить ЮKassa». Настоящая
// защита всё равно на сервере (updateCertificateSalesEnabledAction
// проверяет и certificate_templates, и аккаунт ЮKassa заново) — здесь
// только UX, чтобы не бить по API вслепую.
export function CertificateSalesToggle({
  enabled: initialEnabled,
  hasTemplate,
  yookassaConnected,
  onRequireDesign,
  demo = false,
}: {
  enabled: boolean;
  hasTemplate: boolean;
  yookassaConnected: boolean;
  onRequireDesign: () => void;
  /** Демо-кабинет тура: переключаем на месте, без ЮKassa и без запроса. */
  demo?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  // Показываем кнопку «Подключить ЮKassa» рядом с ошибкой, когда причина
  // именно в неподключенной ЮKassa (клиентский гейт или серверная ошибка,
  // если подключение отозвали между загрузкой страницы и кликом).
  const [needsYooKassa, setNeedsYooKassa] = useState(false);

  const handleClick = () => {
    if (!hasTemplate) {
      onRequireDesign();
      return;
    }

    const next = !enabled;
    setMessage("");
    setNeedsYooKassa(false);

    if (demo) {
      setEnabled(next);
      return;
    }

    // Включить продажу без подключенной ЮKassa нельзя — не бьём по API,
    // сразу показываем ошибку и кнопку подключения.
    if (next && !yookassaConnected) {
      setMessage("Сначала подключи ЮKassa, чтобы продавать сертификаты.");
      setNeedsYooKassa(true);
      return;
    }

    startTransition(async () => {
      const result = await updateCertificateSalesEnabledAction({ enabled: next });
      if (result.success) {
        setEnabled(next);
      } else {
        setMessage(result.message);
        // Серверная ошибка про ЮKassa (например, подключение отозвали) —
        // тоже показываем кнопку подключения рядом с сообщением.
        setNeedsYooKassa(result.message.includes("ЮKassa"));
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
          "flex w-full items-center justify-between gap-3 rounded-field border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
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
      {message ? (
        <div className="space-y-2">
          <FormMessage message={message} success={false} />
          {needsYooKassa ? (
            <ButtonLink href="/api/yookassa/oauth/start" documentNavigation>
              Подключить ЮKassa
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
