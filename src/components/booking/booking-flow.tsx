"use client";

import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { BrandThemeStyle } from "@/components/brand-theme/brand-theme-style";
import {
  defaultBookingThemePresetId,
  type BookingThemePresetId,
} from "@/lib/booking-theme-presets";
import { publicThemeAttr } from "@/lib/brand-theme/attr";
import type { BrandTheme } from "@/lib/brand-theme/schema";
import {
  buildFullPhone,
  defaultPhoneCountryCode,
  getPhoneCountry,
  isValidNationalPhone,
  phoneCountries,
} from "@/lib/phone";
import {
  defaultBookingPageSettings,
  type CommentFieldMode,
} from "@/lib/booking-page-settings";
import { cn } from "@/lib/utils";
import type { BookingSlot, Service } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/mock-data";
import { computePrepaymentAmount } from "@/lib/prepayment";
import {
  applyDiscount,
  currentPeriodDiscount,
  discountKindLabels,
  resolveBookingDiscount,
  type HotWindowsDiscount,
} from "@/lib/service-discounts";
import { DiscountBadge, masterTodayIso, ServicePrice } from "@/components/public/service-price";
import type { AcquisitionSource } from "@/lib/acquisition-sources";

type BookingFlowProps = {
  username: string;
  services: Service[];
  bookingSlotsByService: Record<string, BookingSlot[]>;
  themePresetId?: BookingThemePresetId;
  brandTheme?: BrandTheme | null;
  commentFieldMode?: CommentFieldMode;
  mode?: "live" | "demo";
  initialServiceId?: string;
  /**
   * Предвыбранные день и время. Приходят из ссылки, которую даёт консультант,
   * когда предлагает записаться повторно: клиент уже нажал время в чате, и
   * заставлять его искать тот же слот заново незачем.
   *
   * Подставляются только если слот действительно свободен — пока клиент шёл
   * по ссылке, его могли занять.
   */
  initialDate?: string;
  initialTime?: string;
  phoneVerificationRequired?: boolean;
  /** Откуда клиент пришёл (документы/источники-записей.md), уходит с записью. */
  acquisitionSource?: AcquisitionSource | null;
  /** Пояс мастера: даты акций и горящих окошек — в его календаре. */
  timezone?: string;
  hotWindowsDiscount?: HotWindowsDiscount | null;
};

const steps = ["Услуга", "Дата и время", "Контакты"];

function pluralizeDays(days: number) {
  const mod10 = days % 10;
  const mod100 = days % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "день";
  }

  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return "дня";
  }

  return "дней";
}

export function BookingFlow({
  username,
  services,
  bookingSlotsByService,
  themePresetId = defaultBookingThemePresetId,
  brandTheme = null,
  commentFieldMode = defaultBookingPageSettings.commentFieldMode,
  mode = "live",
  initialServiceId,
  initialDate,
  initialTime,
  phoneVerificationRequired = false,
  acquisitionSource = null,
  timezone = "Europe/Simferopol",
  hotWindowsDiscount = null,
}: BookingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const resolvedInitialServiceId =
    initialServiceId && services.some((service) => service.id === initialServiceId)
      ? initialServiceId
      : services[0]?.id ?? "";
  const [serviceId, setServiceId] = useState(resolvedInitialServiceId);
  const initialSlots = bookingSlotsByService[resolvedInitialServiceId] ?? [];
  // Слот из ссылки проверяем по настоящей выдаче: если его уже заняли, форма
  // молча откатывается на первый свободный, а не предлагает записаться на
  // время, которого больше нет.
  const requestedDay = initialDate
    ? initialSlots.find((slot) => slot.value === initialDate)
    : undefined;
  const requestedTime =
    requestedDay && initialTime && requestedDay.times.includes(initialTime)
      ? initialTime
      : undefined;
  const [dateValue, setDateValue] = useState(
    requestedTime ? requestedDay!.value : initialSlots[0]?.value ?? "",
  );
  const [time, setTime] = useState(
    requestedTime ?? initialSlots[0]?.times[0] ?? "",
  );
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState(defaultPhoneCountryCode);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [wantsRepeatVisitReminder, setWantsRepeatVisitReminder] = useState(false);
  const [certificateCode, setCertificateCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Подтверждение номера по SMS: код привязан к конкретному полному номеру,
  // при смене номера пользователь проходит подтверждение заново.
  const [codeSentPhone, setCodeSentPhone] = useState("");
  const [codeChannel, setCodeChannel] = useState<"call" | "sms">("sms");
  const [codeInput, setCodeInput] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verifiedToken, setVerifiedToken] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);

  // Обратный звонок (запасной канал): клиент сам звонит на номер от sms.ru,
  // статус опрашиваем, пока sms.ru не подтвердит совпадение номера.
  const [callcheckPhone, setCallcheckPhone] = useState("");
  const [callcheckPretty, setCallcheckPretty] = useState("");
  const [callcheckFor, setCallcheckFor] = useState("");
  const [callcheckExpired, setCallcheckExpired] = useState(false);
  const [startingCallcheck, setStartingCallcheck] = useState(false);
  // Флеш-звонок не ушёл — переключились на запасной канал автоматически, а не
  // по нажатию «Звонок не пришёл?». Флаг нужен только для поясняющей подписи.
  const [callcheckAutoFallback, setCallcheckAutoFallback] = useState(false);

  const fullPhone = useMemo(
    () => buildFullPhone(countryCode, phone),
    [countryCode, phone],
  );
  const isPhoneValid = useMemo(
    () => isValidNationalPhone(countryCode, phone),
    [countryCode, phone],
  );
  const needsPhoneVerification = phoneVerificationRequired && mode === "live";
  const isPhoneVerified =
    !needsPhoneVerification || (Boolean(verifiedToken) && verifiedPhone === fullPhone);
  const isCodeSentToCurrentPhone = codeSentPhone === fullPhone;
  const selectedCountry = getPhoneCountry(countryCode);

  useEffect(() => {
    if (resendSecondsLeft <= 0) {
      return;
    }

    const timer = setTimeout(
      () => setResendSecondsLeft((seconds) => seconds - 1),
      1000,
    );
    return () => clearTimeout(timer);
  }, [resendSecondsLeft]);

  // Запасной канал: клиент сам звонит на номер от sms.ru. Возвращает true,
  // если проверку удалось запустить — тогда UI переходит в режим обратного
  // звонка. isAutoFallback помечает автоматическое переключение после сбоя
  // флеш-звонка, чтобы показать поясняющую подпись.
  const startCallcheckFlow = useCallback(
    async ({ isAutoFallback = false }: { isAutoFallback?: boolean } = {}) => {
      // Защита от двойного запуска: если проверка уже стартует, повторно не
      // дёргаем sms.ru (иначе упрёмся в лимит запасного канала).
      if (startingCallcheck) {
        return false;
      }

      setVerifyError("");
      setStartingCallcheck(true);

      try {
        const response = await fetch("/api/phone-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "callcheck", phone: fullPhone }),
        });
        const payload = await response.json();

        if (!response.ok) {
          setVerifyError(payload.error || "Не получилось запустить проверку звонком.");
          return false;
        }

        setCallcheckPhone(String(payload.callPhone ?? ""));
        setCallcheckPretty(String(payload.callPhonePretty ?? payload.callPhone ?? ""));
        setCallcheckFor(fullPhone);
        setCallcheckExpired(false);
        setCallcheckAutoFallback(isAutoFallback);
        return true;
      } catch {
        setVerifyError("Не получилось запустить проверку звонком. Попробуй еще раз.");
        return false;
      } finally {
        setStartingCallcheck(false);
      }
    },
    [fullPhone, startingCallcheck],
  );

  const sendVerificationCode = useCallback(async () => {
    setVerifyError("");
    setSendingCode(true);

    try {
      const response = await fetch("/api/phone-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone: fullPhone }),
      });
      const payload = await response.json();

      if (!response.ok) {
        // Флеш-звонок не ушёл (лимит номера/флуд по IP/иной сбой). Вместо
        // тупика прозрачно переключаемся на запасной канал — обратный звонок
        // клиента. Если и он не запустился, показываем ошибку как раньше.
        //
        // Если обратный звонок для этого же номера уже активен (например,
        // повторное нажатие «Отправить ещё раз»), заново sms.ru не дёргаем —
        // клиент и так видит режим звонка.
        const callcheckAlreadyLive =
          Boolean(callcheckPhone) && callcheckFor === fullPhone && !callcheckExpired;
        if (callcheckAlreadyLive) {
          setCodeSentPhone(fullPhone);
          return;
        }

        const startedFallback = await startCallcheckFlow({ isAutoFallback: true });
        if (startedFallback) {
          // callcheck-UI показывается только для «отправленного» номера.
          setCodeSentPhone(fullPhone);
          setCodeInput("");
          if (typeof payload.retryAfterSeconds === "number") {
            setResendSecondsLeft(payload.retryAfterSeconds);
          }
          return;
        }

        setVerifyError(payload.error || "Не получилось отправить SMS.");
        if (typeof payload.retryAfterSeconds === "number") {
          setCodeSentPhone(fullPhone);
          setResendSecondsLeft(payload.retryAfterSeconds);
        }
        return;
      }

      setCodeSentPhone(fullPhone);
      setCodeChannel(payload.channel === "call" ? "call" : "sms");
      setCodeInput("");
      setResendSecondsLeft(
        typeof payload.retryAfterSeconds === "number" ? payload.retryAfterSeconds : 60,
      );
    } catch {
      setVerifyError("Не получилось отправить SMS. Проверь интернет и попробуй еще раз.");
    } finally {
      setSendingCode(false);
    }
  }, [fullPhone, startCallcheckFlow, callcheckPhone, callcheckFor, callcheckExpired]);

  const callcheckActive =
    Boolean(callcheckPhone) &&
    callcheckFor === fullPhone &&
    !callcheckExpired &&
    !isPhoneVerified;

  useEffect(() => {
    if (!callcheckActive) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/phone-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "callcheck-status",
            phone: fullPhone,
            username,
          }),
        });
        const payload = await response.json();

        if (cancelled || !response.ok) {
          return;
        }

        if (payload.confirmed && payload.token) {
          setVerifiedToken(String(payload.token));
          setVerifiedPhone(fullPhone);
        } else if (payload.expired) {
          setCallcheckExpired(true);
        }
      } catch {
        // Сетевые сбои при поллинге молча пропускаем — следующий тик повторит.
      }
    };

    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [callcheckActive, fullPhone, username]);

  const verifyCode = useCallback(async () => {
    setVerifyError("");
    setVerifyingCode(true);

    try {
      const response = await fetch("/api/phone-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          phone: fullPhone,
          code: codeInput.trim(),
          username,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setVerifyError(payload.error || "Код не подошел. Попробуй еще раз.");
        return;
      }

      setVerifiedToken(String(payload.token ?? ""));
      setVerifiedPhone(fullPhone);
    } catch {
      setVerifyError("Не получилось проверить код. Попробуй еще раз.");
    } finally {
      setVerifyingCode(false);
    }
  }, [codeInput, fullPhone, username]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId),
    [serviceId, services],
  );
  // Предоплата (Модуль 2, okno-tz-rating-prepayment.md): показываем сумму и
  // явное предупреждение о невозвратности при неявке ДО того, как клиент
  // нажмёт кнопку и уйдёт на оплату ЮKassa (ТЗ 2.7, второй пункт).
  // Скидка на выбранное время (src/lib/service-discounts.ts). Новый ли
  // клиент, станет ясно только на сервере по телефону, поэтому скидку на
  // первый визит здесь не считаем, а только обещаем строкой в сводке.
  const discountFor = useCallback(
    (date: string, slotTime: string | undefined) => {
      if (!selectedService || !date || !slotTime) return null;
      return resolveBookingDiscount({
        service: selectedService,
        visitDate: date,
        visitStartIso:
          DateTime.fromISO(`${date}T${slotTime}`, { zone: timezone }).toUTC().toISO() ?? "",
        isFirstVisit: null,
        hotWindows: hotWindowsDiscount,
      });
    },
    [hotWindowsDiscount, selectedService, timezone],
  );
  const visitDiscount = useMemo(() => discountFor(dateValue, time), [dateValue, discountFor, time]);
  const visitPrice = selectedService
    ? visitDiscount
      ? applyDiscount(selectedService.price, visitDiscount.percent)
      : selectedService.price
    : 0;
  const firstVisitPercent = selectedService?.firstVisitDiscountPercent ?? 0;
  const prepaymentAmount = useMemo(() => {
    if (!selectedService || selectedService.prepaymentType === "none") {
      return 0;
    }

    return Math.min(
      visitPrice,
      computePrepaymentAmount({
        prepaymentType: selectedService.prepaymentType,
        prepaymentValue: selectedService.prepaymentValue,
        servicePrice: visitPrice,
      }),
    );
  }, [selectedService, visitPrice]);
  const masterToday = masterTodayIso(timezone);
  const bookingSlots = useMemo(
    () => bookingSlotsByService[serviceId] ?? [],
    [bookingSlotsByService, serviceId],
  );
  const selectedDate = useMemo(
    () => bookingSlots.find((slot) => slot.value === dateValue),
    [bookingSlots, dateValue],
  );
  const selectedDateLabel = useMemo(
    () =>
      dateValue
        ? DateTime.fromISO(dateValue).setLocale("ru").toFormat("d MMMM")
        : "",
    [dateValue],
  );
  const selectedDateTimes = useMemo(
    () => selectedDate?.times ?? [],
    [selectedDate],
  );

  useEffect(() => {
    if (!services.some((service) => service.id === serviceId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- правило ужесточилось в eslint-plugin-react-hooks 7.1; код рабочий, разбор без спешки отдельно
      setServiceId(resolvedInitialServiceId);
    }
  }, [resolvedInitialServiceId, serviceId, services]);

  useEffect(() => {
    const firstDay = bookingSlots[0];

    if (!firstDay) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- правило ужесточилось в eslint-plugin-react-hooks 7.1; код рабочий, разбор без спешки отдельно
      setDateValue("");
      setTime("");
      return;
    }

    if (!bookingSlots.some((slot) => slot.value === dateValue)) {
      setDateValue(firstDay.value);
      setTime(firstDay.times[0] ?? "");
      return;
    }

    if (!selectedDate?.times.includes(time)) {
      setTime(selectedDate?.times[0] ?? firstDay.times[0] ?? "");
    }
  }, [bookingSlots, dateValue, time, selectedDate]);

  const nextStep = useCallback(
    () => setStep((current) => Math.min(current + 1, steps.length - 1)),
    [],
  );
  const prevStep = useCallback(
    () => setStep((current) => Math.max(current - 1, 0)),
    [],
  );

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- правило ужесточилось в eslint-plugin-react-hooks 7.1; код рабочий, разбор без спешки отдельно
  const submit = useCallback(async () => {
    setError("");

    if (commentFieldMode === "required" && note.trim().length === 0) {
      setError("Мастер просит оставить комментарий к записи.");
      return;
    }

    if (needsPhoneVerification && !isPhoneVerified) {
      setError("Сначала подтверди номер телефона кодом.");
      return;
    }

    setPending(true);

    try {
      if (mode === "demo") {
        const params = new URLSearchParams({
          service: selectedService?.title ?? "Услуга",
          date: selectedDateLabel,
          time,
          name,
        });
        router.push(`/demo/public-page/confirm?${params.toString()}`);
        return;
      }

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          serviceId,
          date: dateValue,
          time,
          name,
          phone: fullPhone,
          note,
          wantsRepeatVisitReminder,
          ...(needsPhoneVerification ? { phoneVerificationToken: verifiedToken } : {}),
          ...(certificateCode.trim() ? { certificateCode: certificateCode.trim() } : {}),
          ...(acquisitionSource ? { acquisitionSource } : {}),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Не получилось создать запись.");
        return;
      }

      const redirectUrl = String(payload.redirectUrl || `/${username}/confirm`);
      // Предоплата уводит клиента на домен ЮKassa — это внешний адрес, и
      // router.push (клиентский переход) его не откроет. Полная навигация
      // нужна и для внешних, и для собственных абсолютных ссылок.
      const isExternalRedirect =
        redirectUrl.startsWith("http") &&
        !redirectUrl.startsWith(window.location.origin);

      if (isExternalRedirect) {
        window.location.href = redirectUrl;
      } else if (redirectUrl.startsWith("http")) {
        const url = new URL(redirectUrl);
        router.push(`${url.pathname}${url.search}`);
      } else {
        router.push(redirectUrl);
      }
    } catch {
      setError("Что-то пошло не так. Попробуй еще раз.");
    } finally {
      setPending(false);
    }
  }, [
    acquisitionSource,
    certificateCode,
    commentFieldMode,
    dateValue,
    fullPhone,
    isPhoneVerified,
    mode,
    name,
    needsPhoneVerification,
    note,
    router,
    selectedDateLabel,
    selectedService?.title,
    serviceId,
    time,
    username,
    verifiedToken,
    wantsRepeatVisitReminder,
  ]);

  return (
    <div {...publicThemeAttr(themePresetId, brandTheme)}>
      <BrandThemeStyle theme={brandTheme} />
      <Card className="relative z-10 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            {steps.map((item, index) => (
              <div key={item} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-xs",
                    index <= step
                      ? "border-ink bg-ink text-ink-contrast"
                      : "border-line bg-[var(--ui-field-bg)] text-muted",
                  )}
                >
                  {index < step ? <Check size={14} /> : index + 1}
                </span>
                <span className="hidden sm:inline">{item}</span>
              </div>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-panel">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {step === 0 ? (
          <div className="grid gap-3">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => setServiceId(service.id)}
                className={cn(
                  "touch-manipulation rounded-nested border p-4 text-left transition active:scale-[0.99]",
                  service.id === serviceId
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-[var(--ui-field-bg)] hover:bg-panel",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium text-ink">{service.title}</p>
                    <p className="text-sm leading-6 text-muted">
                      {service.description}
                    </p>
                  </div>
                  {/* shrink-0 + nowrap: без них колонка сжималась до ширины
                      самого числа и «150» отрывалось от «мин», из-за чего
                      одинаковые по смыслу данные занимали от одной до трёх
                      строк, а карточки получались разной высоты. */}
                  <div className="shrink-0 whitespace-nowrap text-right text-sm text-ink-soft">
                    <p>{service.durationMinutes} мин</p>
                    <ServiceListPrice service={service} today={masterToday} />
                    {service.firstVisitDiscountPercent ? (
                      <p className="mt-1 text-xs text-accent-deep">
                        −{service.firstVisitDiscountPercent}% впервые
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-ink">
                Выберите дату
              </h2>
              {bookingSlots.length > 0 ? (
                <>
                  <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar snap-x snap-mandatory sm:hidden">
                    {bookingSlots.map((slot) => {
                      const slotDate = DateTime.fromISO(slot.value, {
                        zone: "utc",
                      }).setLocale("ru");
                      const weekdayLabel = slotDate.toFormat("ccc");
                      const dayNumber = slotDate.toFormat("d");
                      const dayDiscount = discountFor(slot.value, slot.times[0]);

                      return (
                        <button
                          key={slot.value}
                          type="button"
                          onClick={() => setDateValue(slot.value)}
                          className="relative touch-manipulation snap-start shrink-0 pt-2 active:scale-[0.99]"
                        >
                          {dayDiscount ? (
                            <DiscountBadge
                              percent={dayDiscount.percent}
                              className="absolute right-0 top-0 z-10 px-1.5 text-[10px] leading-3"
                            />
                          ) : null}
                          <div
                            className={cn(
                              "flex min-w-[78px] flex-col items-center rounded-panel border px-4 py-3 text-center transition",
                              slot.value === dateValue
                                ? "border-ink bg-ink text-ink-contrast"
                                : "border-line bg-[var(--ui-field-bg)] text-ink",
                            )}
                          >
                            <p
                              className={cn(
                                "text-[11px] font-medium uppercase tracking-[0.08em]",
                                slot.value === dateValue
                                  ? "text-ink-contrast"
                                  : "text-ink-soft",
                              )}
                            >
                              {weekdayLabel}
                            </p>
                            <div
                              className="mt-1 text-[30px] leading-none font-semibold"
                            >
                              {dayNumber}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="hidden gap-3 sm:grid sm:grid-cols-4 lg:grid-cols-7">
                    {bookingSlots.map((slot) => {
                      const slotDate = DateTime.fromISO(slot.value, {
                        zone: "utc",
                      }).setLocale("ru");
                      const weekdayLabel = slotDate.toFormat("ccc");
                      const dayNumber = slotDate.toFormat("d");
                      const dayDiscount = discountFor(slot.value, slot.times[0]);

                      return (
                        <button
                          key={slot.value}
                          type="button"
                          onClick={() => setDateValue(slot.value)}
                          className="relative touch-manipulation space-y-3 text-center active:scale-[0.99]"
                        >
                          {dayDiscount ? (
                            <DiscountBadge
                              percent={dayDiscount.percent}
                              className="absolute -right-1 top-7 z-10 px-1.5 text-[10px] leading-3"
                            />
                          ) : null}
                          <p className="text-sm font-medium uppercase text-ink-soft">
                            {weekdayLabel}
                          </p>
                          <div
                            className={cn(
                              "rounded-field border px-4 py-3 text-xl font-medium transition",
                              slot.value === dateValue
                                ? "border-ink bg-ink text-ink-contrast"
                                : "border-line bg-[var(--ui-field-bg)] text-ink hover:bg-panel",
                            )}
                          >
                            {dayNumber}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="rounded-nested border border-dashed border-line p-5 text-sm leading-6 text-muted">
                  На ближайшие дни свободного времени пока нет. Попробуй выбрать другую услугу или зайди позже.
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-ink">
                Свободное время
              </h2>
              {selectedDateTimes.length > 0 ? (
                <>
                  <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar snap-x snap-mandatory sm:hidden">
                    {selectedDateTimes.map((slotTime) => (
                      <button
                        key={slotTime}
                        type="button"
                        onClick={() => setTime(slotTime)}
                        className={cn(
                          "touch-manipulation snap-start shrink-0 rounded-panel border px-5 py-3 text-center text-lg font-semibold transition active:scale-[0.99]",
                          slotTime === time
                            ? "border-ink bg-ink text-ink-contrast"
                            : "border-line bg-[var(--ui-field-bg)] text-ink",
                        )}
                      >
                        {slotTime}
                      </button>
                    ))}
                  </div>

                  <div className="hidden grid-cols-2 gap-x-6 gap-y-4 sm:grid sm:grid-cols-3">
                    {selectedDateTimes.map((slotTime) => (
                      <button
                        key={slotTime}
                        type="button"
                        onClick={() => setTime(slotTime)}
                        className={cn(
                          "touch-manipulation rounded-panel px-4 py-4 text-center text-2xl font-medium transition active:scale-[0.99]",
                          slotTime === time
                            ? "bg-ink text-ink-contrast"
                            : "bg-transparent text-ink hover:bg-panel",
                        )}
                      >
                        {slotTime}
                      </button>
                    ))}
                  </div>
                </>
              ) : selectedDate ? (
                <div className="rounded-nested border border-dashed border-line p-5 text-sm leading-6 text-muted">
                  На эту дату свободного времени уже нет.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <Input
              label="Как вас зовут"
              placeholder="Например, Марина"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex w-24 shrink-0 flex-col gap-2 text-sm">
                  <span
                    className="font-medium"
                    style={{ color: "var(--color-ink)" }}
                  >
                    Код
                  </span>
                  <span className="relative block">
                    <span
                      className="flex min-h-12 items-center justify-between gap-1 rounded-field border px-3 text-sm"
                      style={{
                        borderColor: "var(--color-line)",
                        backgroundColor: "var(--ui-field-bg)",
                        color: "var(--color-ink)",
                      }}
                    >
                      {countryCode}
                      <ChevronDown size={14} />
                    </span>
                    {/* Невидимый select поверх: в поле виден только код, полный
                        справочник со странами открывается нативным списком. */}
                    <select
                      aria-label="Код страны"
                      value={countryCode}
                      onChange={(event) => setCountryCode(event.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    >
                      {phoneCountries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.flag} {country.code} · {country.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                <div className="min-w-44 flex-1">
                  <Input
                    label="Телефон"
                    placeholder={selectedCountry?.placeholder ?? "978 000-00-00"}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className="w-full"
                  />
                </div>
                {needsPhoneVerification ? (
                  isPhoneVerified ? (
                    <span className="flex min-h-12 items-center gap-2 text-sm font-medium text-ink">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft">
                        <Check size={14} />
                      </span>
                      Подтвержден
                    </span>
                  ) : (
                    <Button
                      onClick={sendVerificationCode}
                      disabled={!isPhoneValid || sendingCode || (isCodeSentToCurrentPhone && resendSecondsLeft > 0)}
                      className="disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sendingCode
                        ? "Получаю..."
                        : isCodeSentToCurrentPhone
                          ? resendSecondsLeft > 0
                            ? `Еще раз через ${resendSecondsLeft} с`
                            : "Отправить еще раз"
                          : "Получить код"}
                    </Button>
                  )
                ) : null}
              </div>
              {needsPhoneVerification && isCodeSentToCurrentPhone && !isPhoneVerified ? (
                <>
                  {!callcheckActive ? (
                    <>
                      <p className="text-sm leading-6 text-ink-soft">
                        {codeChannel === "call"
                          ? `Сейчас на ${fullPhone} поступит звонок-сброс. Отвечать не нужно — введи последние 4 цифры номера, с которого звонили.`
                          : `Отправили SMS с кодом на ${fullPhone}.`}
                      </p>
                      <div className="flex flex-wrap items-end gap-3">
                        <Input
                          label={
                            codeChannel === "call"
                              ? "Последние 4 цифры номера"
                              : "Код из SMS"
                          }
                          placeholder="0000"
                          value={codeInput}
                          onChange={(event) =>
                            setCodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))
                          }
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          className="w-44 text-center tracking-[0.3em]"
                        />
                        <Button
                          onClick={verifyCode}
                          disabled={codeInput.trim().length < 4 || verifyingCode}
                          className="disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {verifyingCode ? "Проверяю..." : "Подтвердить"}
                        </Button>
                      </div>
                      <button
                        type="button"
                        onClick={() => startCallcheckFlow()}
                        disabled={startingCallcheck}
                        className="w-fit text-sm text-ink-soft underline underline-offset-4 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {startingCallcheck
                          ? "Запускаю проверку..."
                          : "Звонок не пришел? Подтверди сам обратным звонком"}
                      </button>
                    </>
                  ) : (
                    <div className="space-y-2 rounded-panel bg-panel p-4 text-sm leading-6 text-ink-soft">
                      {callcheckAutoFallback ? (
                        <p className="text-xs font-medium text-ink">
                          Звонок с кодом временно недоступен — подтверди номер
                          обратным звонком.
                        </p>
                      ) : null}
                      <p>
                        Позвони с номера {fullPhone} на{" "}
                        <a
                          href={`tel:+${callcheckPhone}`}
                          className="font-semibold text-ink underline underline-offset-4"
                        >
                          {callcheckPretty}
                        </a>
                        {" "}— звонок сбросится, это бесплатно. Номер подтвердится
                        автоматически.
                      </p>
                      <p className="text-xs text-muted">
                        Ждем твой звонок... На это есть 5 минут.
                      </p>
                    </div>
                  )}
                  {callcheckExpired ? (
                    <p className="text-sm text-warning">
                      Время на звонок вышло. Запусти проверку еще раз.
                    </p>
                  ) : null}
                </>
              ) : null}
              {phone.length > 0 && !isPhoneValid ? (
                <p className="text-sm text-warning">
                  Проверь номер: для {countryCode} нужно{" "}
                  {selectedCountry
                    ? selectedCountry.minDigits === selectedCountry.maxDigits
                      ? `${selectedCountry.minDigits} цифр`
                      : `${selectedCountry.minDigits}–${selectedCountry.maxDigits} цифр`
                    : "8–12 цифр"}{" "}
                  после кода страны.
                </p>
              ) : null}
              {verifyError ? (
                <p className="text-sm text-warning">{verifyError}</p>
              ) : null}
              <p
                className="text-xs"
                style={{ color: "var(--color-muted)" }}
              >
                Нужен только для подтверждения записи и связи по визиту. Никакого спама.
              </p>
            </div>
            {commentFieldMode !== "hidden" ? (
              <Textarea
                label={
                  commentFieldMode === "required"
                    ? "Комментарий к записи*"
                    : "Комментарий к записи"
                }
                placeholder="Например: аллергия на гель, опоздаю на 10 минут, хочу нюд без дизайна"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                hint={
                  commentFieldMode === "required"
                    ? "Мастер просит обязательно оставить комментарий."
                    : "Поле необязательное, но мастеру правда полезно."
                }
              />
            ) : null}
            {selectedService?.repeatIntervalDays ? (
              <label className="flex items-start gap-3 rounded-panel border border-line bg-[var(--ui-field-bg)] p-4 text-sm leading-6 text-ink-soft">
                <input
                  type="checkbox"
                  checked={wantsRepeatVisitReminder}
                  onChange={(event) => setWantsRepeatVisitReminder(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-current"
                />
                <span>
                  Напомнить про повторный визит через{" "}
                  {selectedService.repeatIntervalDays}{" "}
                  {pluralizeDays(selectedService.repeatIntervalDays)}
                </span>
              </label>
            ) : null}
            {mode === "live" ? (
              <Input
                label="Код сертификата (если есть)"
                placeholder="OKNO-XXXX-XXXX-XXXX"
                value={certificateCode}
                onChange={(event) => setCertificateCode(event.target.value)}
                hint="Введи код подарочного сертификата, чтобы применить его к этой записи."
              />
            ) : null}
          </div>
        ) : null}

        {step === steps.length - 1 ? (
          <div className="rounded-nested bg-panel p-4 text-sm text-ink-soft">
            <p className="font-medium text-ink">Что вы выбрали</p>
            <p className="mt-2">
              {selectedService?.title} • {selectedDateLabel} • {time}
            </p>
            {selectedService ? (
              <div className="mt-3 flex items-end justify-between gap-4 border-t border-line pt-3">
                <span>
                  Стоимость
                  {visitDiscount ? (
                    <span className="block text-xs text-accent-deep">
                      Скидка: {discountKindLabels[visitDiscount.kind]}
                    </span>
                  ) : null}
                </span>
                <ServicePrice
                  price={selectedService.price}
                  discountPercent={visitDiscount?.percent}
                  size="md"
                />
              </div>
            ) : null}
            {firstVisitPercent > (visitDiscount?.percent ?? 0) ? (
              <p className="mt-2 text-xs leading-5 text-accent-deep">
                Если записываетесь к мастеру впервые, цена будет на {firstVisitPercent}% ниже —
                проверим по номеру телефона.
              </p>
            ) : null}
            {mode === "demo" ? (
              <p className="mt-3 text-xs leading-6 text-muted">
                Это демонстрационная запись. На финальном шаге откроется demo-подтверждение без сохранения в базу.
              </p>
            ) : null}
            {prepaymentAmount > 0 ? (
              <div className="mt-3 rounded-field bg-warning-soft px-3 py-2 text-xs leading-6 text-warning">
                Для подтверждения записи нужна предоплата {formatCurrency(prepaymentAmount)} —
                после отправки формы откроется страница оплаты ЮKassa. Предоплата не
                возвращается при неявке на визит.
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-panel bg-warning-soft px-4 py-3 text-sm text-warning">
            {error}
          </div>
        ) : null}

        <div
          className={cn(
            "flex flex-wrap items-center gap-3",
            step === steps.length - 1 ? "justify-center" : "justify-between",
          )}
        >
          {/* На первом шаге кнопка не просто неактивна, а не нужна вовсе:
              выше в шапке уже есть «Назад», и два одинаковых элемента, один
              из которых мёртвый, только сбивают. */}
          {step > 0 ? (
            <Button variant="ghost" onClick={prevStep}>
              Назад
            </Button>
          ) : (
            <span aria-hidden />
          )}
          {step < steps.length - 1 ? (
            <Button
              onClick={nextStep}
              className="gap-2"
              disabled={
                (step === 0 && !selectedService) ||
                (step === 1 && (!dateValue || !time))
              }
            >
              Дальше
              <ChevronRight size={16} />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={
                !name ||
                !isPhoneValid ||
                pending ||
                (needsPhoneVerification && !isPhoneVerified)
              }
              className="min-w-56 gap-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending
                ? mode === "demo"
                  ? "Открываю демо..."
                  : "Создаю запись..."
                : "Подтвердить запись"}
              <ChevronRight size={16} />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

// Цена в списке услуг: акция, что идёт сегодня, — со старой ценой и процентом.
function ServiceListPrice({ service, today }: { service: Service; today: string }) {
  const period = currentPeriodDiscount(service, today);
  if (!period || period.startsLater) return <p>{formatCurrency(service.price)}</p>;
  return (
    <ServicePrice
      price={service.price}
      discountPercent={period.percent}
      size="sm"
      className="mt-1"
    />
  );
}
