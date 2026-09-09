"use client";

import { useCallback, useState } from "react";
import Script from "next/script";
import { CalendarClock, RefreshCw, Share2 } from "lucide-react";
import { PhoneVerify } from "@/app/tg/phone-verify";
import { Button, ButtonLink } from "@/components/ui/button";

type MiniAppBooking = {
  bookingId: string;
  masterName: string;
  masterUsername: string;
  masterUrl: string;
  serviceTitle: string;
  startsAtIso: string;
  startsAtLabel: string;
  cancelUrl: string | null;
};

type MiniAppData = {
  firstName: string | null;
  hasIdentity: boolean;
  bookings: MiniAppBooking[];
};

type State =
  | { kind: "loading" }
  | { kind: "outside" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MiniAppData };

// Telegram кладёт свой SDK в window при запуске мини-аппа. Типизируем ровно
// то, чем пользуемся: описывать весь интерфейс ради четырёх вызовов незачем.
type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  requestContact?: (callback: (shared: boolean) => void) => void;
};

function getWebApp(): TelegramWebApp | null {
  const telegram = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } })
    .Telegram;

  return telegram?.WebApp ?? null;
}

export function MiniAppClient() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Подпись запуска нужна и для повторов: после ошибки, после того как человек
  // поделился номером, и для формы подтверждения другого номера. Живёт в
  // состоянии, а не в ref: форма получает её пропсом, то есть значение
  // участвует в рендере.
  const [initData, setInitData] = useState("");
  const [sharing, setSharing] = useState(false);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);

  const load = useCallback(async (initData: string) => {
    try {
      const response = await fetch("/api/telegram/miniapp/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });

      const payload = (await response.json()) as
        | ({ ok: true } & MiniAppData)
        | { ok: false; reason: string };

      if (!payload.ok) {
        setState({
          kind: "error",
          message:
            payload.reason === "expired"
              ? "Сессия устарела. Закрой и открой окно заново."
              : "Не получилось подтвердить, что это ты. Открой кабинет из чата с ботом.",
        });

        return;
      }

      setState({ kind: "ready", data: payload });
    } catch {
      setState({ kind: "error", message: "Нет связи. Проверь интернет и попробуй ещё раз." });
    }
  }, []);

  // Точка входа — загрузка SDK, а не монтирование компонента. Так эффект не
  // нужен вовсе: Telegram кладёт initData в window при выполнении скрипта, и
  // раньше этого момента читать всё равно нечего.
  const handleSdkReady = useCallback(() => {
    const webApp = getWebApp();

    // Страницу открыли не из Telegram — например, перешли по ссылке в
    // браузере. Подписи нет, показывать нечего, и притворяться не нужно.
    if (!webApp?.initData) {
      setState({ kind: "outside" });
      return;
    }

    setInitData(webApp.initData);
    webApp.ready();
    webApp.expand();
    void load(webApp.initData);
  }, [load]);

  // Просим номер прямо из мини-аппа. Метод появился не сразу, поэтому если
  // его нет — честно отправляем в чат, где есть кнопка под полем ввода.
  const requestContact = useCallback(() => {
    const webApp = getWebApp();

    if (!webApp?.requestContact) {
      setState({
        kind: "error",
        message:
          "Твоя версия Telegram не умеет делиться номером отсюда. Напиши боту в чат — там под полем ввода будет кнопка «Показать все мои записи».",
      });

      return;
    }

    setSharing(true);

    webApp.requestContact((shared) => {
      setSharing(false);

      if (!shared) {
        return;
      }

      // Контакт уходит боту отдельным сообщением, и личность появляется не
      // мгновенно. Перечитываем с небольшой задержкой.
      setTimeout(() => {
        void load(initData);
      }, 1200);
    });
  }, [initData, load]);

  // Скрипт грузится afterInteractive намеренно. При beforeInteractive Telegram
  // успевает поставить свои CSS-переменные на <html> до гидратации, и React
  // ругается на расхождение разметки.
  const sdk = (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      onReady={handleSdkReady}
    />
  );

  if (state.kind === "loading") {
    return (
      <>
        {sdk}
        <p className="py-16 text-center text-sm text-muted">Загружаем твои записи…</p>
      </>
    );
  }

  if (state.kind === "outside") {
    return (
      <div className="space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold text-ink">Кабинет клиента okno</h1>
        <p className="text-sm leading-6 text-ink-soft">
          Эта страница открывается внутри Telegram — из чата с ботом okno.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-sm leading-6 text-ink-soft">{state.message}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setState({ kind: "loading" });
            void load(initData);
          }}
          className="gap-2"
        >
          <RefreshCw size={14} />
          Обновить
        </Button>
      </div>
    );
  }

  const { data } = state;

  return (
    <div className="space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-ink">
          {data.firstName ? `${data.firstName}, твои визиты` : "Твои визиты"}
        </h1>
        <p className="text-sm leading-6 text-muted">
          {data.hasIdentity
            ? "Все записи у мастеров okno на твой номер."
            : "Записи, которые ты подключил к боту."}
        </p>
      </div>

      {data.bookings.length === 0 ? (
        <div className="rounded-card bg-panel p-5 text-sm leading-6 text-ink-soft">
          Ближайших записей нет.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.bookings.map((booking) => (
            <li key={booking.bookingId} className="rounded-card bg-panel p-5">
              <p className="font-medium text-ink">{booking.serviceTitle}</p>
              <p className="mt-1 text-sm text-ink-soft">{booking.masterName}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink">
                <CalendarClock size={14} className="shrink-0" />
                {booking.startsAtLabel}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {booking.cancelUrl ? (
                  <ButtonLink href={booking.cancelUrl} variant="secondary">
                    Перенести или отменить
                  </ButtonLink>
                ) : null}
                <ButtonLink href={booking.masterUrl} variant="secondary" documentNavigation>
                  Записаться ещё
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.hasIdentity ? null : (
        <div className="space-y-3 rounded-card border border-line p-5">
          <p className="text-sm leading-6 text-ink-soft">
            Поделись номером — и я покажу все твои визиты у любого мастера okno, а не
            только подключённые вручную.
          </p>
          <Button onClick={requestContact} disabled={sharing} className="w-full gap-2">
            <Share2 size={14} />
            {sharing ? "Ждём номер…" : "Поделиться номером"}
          </Button>

          {/* Номер в Telegram и номер, на который человек записывался, — разные
              вещи. Без этого пути у владельца двух номеров кабинет остаётся
              пустым, а кнопка контакта ему не поможет. */}
          {showPhoneVerify ? (
            <PhoneVerify
              initData={initData}
              onVerified={() => {
                setShowPhoneVerify(false);
                setState({ kind: "loading" });
                void load(initData);
              }}
            />
          ) : (
            <Button
              variant="ghost"
              onClick={() => setShowPhoneVerify(true)}
              className="w-full"
            >
              В Telegram другой номер
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
