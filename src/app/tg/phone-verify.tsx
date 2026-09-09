"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  buildFullPhone,
  defaultPhoneCountryCode,
  getPhoneCountry,
  isValidNationalPhone,
  nationalPhoneDigits,
  phoneCountries,
} from "@/lib/phone";

// Подтверждение другого номера.
//
// Кнопка «поделиться контактом» отдаёт номер телефона Telegram, а записывался
// человек мог на другой — два номера у одного владельца это обычное дело.
// Тогда кабинет по контакту оказывается пустым, и единственный выход отсюда —
// подтвердить нужный номер самому.
//
// Проверка та же, что при записи: звонок-сброс, где код — последние 4 цифры
// звонящего номера. SMS не используем, они не доходят.

type Step =
  | { kind: "phone" }
  | { kind: "code"; channel: "call" | "sms" }
  | { kind: "callcheck"; callPhone: string; callPhonePretty: string };

type PhoneVerifyProps = {
  initData: string;
  onVerified: () => void;
};

export function PhoneVerify({ initData, onVerified }: PhoneVerifyProps) {
  const [countryCode, setCountryCode] = useState(defaultPhoneCountryCode);
  const [national, setNational] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const country = getPhoneCountry(countryCode);
  const fullPhone = buildFullPhone(countryCode, national);
  const phoneReady = isValidNationalPhone(countryCode, national);

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/telegram/miniapp/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, initData, phone: fullPhone }),
      });

      return (await response.json()) as Record<string, unknown> & { error?: string };
    },
    [fullPhone, initData],
  );

  const sendCode = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const payload = await call({ action: "send" });

      if (payload.error) {
        setError(String(payload.error));
        return;
      }

      setStep({ kind: "code", channel: payload.channel === "sms" ? "sms" : "call" });
    } catch {
      setError("Нет связи. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [call]);

  const verifyCode = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const payload = await call({ action: "verify", code: code.trim() });

      if (payload.error) {
        setError(String(payload.error));
        return;
      }

      onVerified();
    } catch {
      setError("Нет связи. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [call, code, onVerified]);

  // Запасной канал: МТС режет входящие flash-call, и там код не придёт никогда.
  // Тогда звонит сам клиент, а sms.ru сверяет номер звонящего.
  const startCallcheck = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const payload = await call({ action: "callcheck" });

      if (payload.error) {
        setError(String(payload.error));
        return;
      }

      setStep({
        kind: "callcheck",
        callPhone: String(payload.callPhone ?? ""),
        callPhonePretty: String(payload.callPhonePretty ?? payload.callPhone ?? ""),
      });
    } catch {
      setError("Нет связи. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [call]);

  // В мини-аппе ссылка tel: не открывается: вебвью Telegram не отдаёт внешние
  // схемы наружу, а openLink из SDK принимает только http и https. Поэтому
  // единственный рабочий путь — положить номер в буфер и дать набрать его в
  // звонилке самому.
  const copyNumber = useCallback(async (value: string) => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    try {
      await navigator.clipboard.writeText(value);
      done();
      return;
    } catch {
      // Clipboard API может быть недоступен в старом вебвью — ниже запасной путь.
    }

    try {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      document.body.removeChild(field);
      done();
    } catch {
      setError("Не получилось скопировать. Выдели номер выше и скопируй вручную.");
    }
  }, []);

  const checkCallcheck = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const payload = await call({ action: "callcheck-status" });

      if (payload.error) {
        setError(String(payload.error));
        return;
      }

      if (payload.confirmed) {
        onVerified();
        return;
      }

      setError(
        payload.expired
          ? "Время на звонок вышло. Начни заново."
          : "Звонка пока не видно. Позвони и нажми ещё раз.",
      );
    } catch {
      setError("Нет связи. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [call, onVerified]);

  return (
    <div className="space-y-4">
      {step.kind === "phone" ? (
        <>
          <Select
            label="Код страны"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
            options={phoneCountries.map((item) => ({
              value: item.code,
              label: `${item.flag} ${item.code} · ${item.label}`,
            }))}
          />
          <Input
            label="Номер телефона"
            inputMode="tel"
            autoComplete="tel"
            placeholder={country?.placeholder}
            value={national}
            onChange={(event) =>
              setNational(nationalPhoneDigits(countryCode, event.target.value))
            }
            hint="Тот номер, на который ты записывался"
          />
          <Button onClick={sendCode} disabled={!phoneReady || busy} className="w-full">
            {busy ? "Отправляем…" : "Получить код"}
          </Button>
        </>
      ) : null}

      {step.kind === "code" ? (
        <>
          <p className="text-sm leading-6" style={{ color: "var(--color-ink-soft)" }}>
            {step.channel === "call"
              ? `Звоним на ${fullPhone}. Отвечать не нужно — код это последние 4 цифры номера, с которого идёт звонок.`
              : `Отправили SMS с кодом на ${fullPhone}.`}
          </p>
          <Input
            label="Код"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
          <Button onClick={verifyCode} disabled={code.length < 4 || busy} className="w-full">
            {busy ? "Проверяем…" : "Подтвердить"}
          </Button>
          <Button variant="ghost" onClick={startCallcheck} disabled={busy} className="w-full">
            Звонок не пришёл?
          </Button>
        </>
      ) : null}

      {step.kind === "callcheck" ? (
        <>
          <p className="text-sm leading-6" style={{ color: "var(--color-ink-soft)" }}>
            Позвони с номера {fullPhone} на номер ниже — звонок бесплатный, можно сразу
            сбросить. Потом вернись сюда и нажми «Я позвонил».
          </p>
          {/* Номер крупно и выделяемым: глобальное user-select: none стоит на
              кнопках и ссылках, а здесь выделение — единственный запасной путь,
              если копирование не сработает. */}
          <p
            className="rounded-field border px-4 py-3 text-center text-lg font-medium"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--ui-field-bg)",
              color: "var(--color-ink)",
              userSelect: "all",
              WebkitUserSelect: "all",
            }}
          >
            {step.callPhonePretty}
          </p>
          <Button onClick={() => void copyNumber(step.callPhone)} className="w-full">
            {copied ? "Скопировано" : "Скопировать номер"}
          </Button>
          <Button variant="secondary" onClick={checkCallcheck} disabled={busy} className="w-full">
            {busy ? "Проверяем…" : "Я позвонил"}
          </Button>
        </>
      ) : null}

      {error ? (
        <p className="text-sm leading-6" style={{ color: "var(--color-warning)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
