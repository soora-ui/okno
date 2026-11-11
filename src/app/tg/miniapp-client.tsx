"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { RefreshCw } from "lucide-react";
import { HomeTab } from "@/app/tg/home-tab";
import { ProfileTab } from "@/app/tg/profile-tab";
import { SearchTab } from "@/app/tg/search-tab";
import { TabBar } from "@/app/tg/tab-bar";
import {
  getWebApp,
  hapticSelect,
  isTelegramWeb,
  openExternal,
  syncTelegramChrome,
} from "@/app/tg/telegram";
import type { MiniAppData, TabId } from "@/app/tg/types";
import { VisitsTab } from "@/app/tg/visits-tab";
import { Button } from "@/components/ui/button";

type State =
  | { kind: "loading" }
  | { kind: "outside" }
  | { kind: "error"; message: string }
  // Мастера при запуске сразу ведём в кабинет — пока идёт вход, показываем
  // скелетон, а не клиентскую главную, которая мелькнула бы на полсекунды.
  | { kind: "cabinet" }
  | { kind: "ready"; data: MiniAppData };

// Запись, перенос и страница мастера открываются в том же вебвью обычной
// навигацией, и возврат «назад» перезагружает приложение. Вкладку помним в
// sessionStorage, чтобы человек вернулся туда, откуда ушёл, а не на главную.
const tabStorageKey = "okno-tg-tab";
const tabIds: TabId[] = ["home", "search", "visits", "profile"];

// Мастер, который хочет увидеть свои записи как клиент, открывает приложение
// с ?mode=client (отдельная кнопка в чате с ботом). Режим помним на всё время
// жизни вебвью: возврат со страницы записи приходит уже без параметра.
const modeStorageKey = "okno-tg-mode";

function isClientMode() {
  try {
    if (new URLSearchParams(window.location.search).get("mode") === "client") {
      window.sessionStorage.setItem(modeStorageKey, "client");
      return true;
    }

    return window.sessionStorage.getItem(modeStorageKey) === "client";
  } catch {
    return false;
  }
}

function readStoredTab(): TabId {
  try {
    const stored = window.sessionStorage.getItem(tabStorageKey) as TabId | null;
    return stored && tabIds.includes(stored) ? stored : "home";
  } catch {
    return "home";
  }
}

export function MiniAppClient() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Подпись запуска нужна и для повторов: после ошибки, после того как человек
  // поделился номером, и для всех форм внутри вкладок. Живёт в состоянии, а не
  // в ref: формы получают её пропсом, то есть значение участвует в рендере.
  const [initData, setInitData] = useState("");
  const [tab, setTab] = useState<TabId>("home");
  const [cabinetBusy, setCabinetBusy] = useState(false);
  const [cabinetError, setCabinetError] = useState("");

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
              ? "Сессия устарела. Закрой и открой приложение заново."
              : "Не получилось подтвердить, что это ты. Открой приложение из чата с ботом.",
        });

        return null;
      }

      return payload as MiniAppData;
    } catch {
      setState({ kind: "error", message: "Нет связи. Проверь интернет и попробуй ещё раз." });
      return null;
    }
  }, []);

  // Вход в кабинет мастера: сервер проверяет подпись Telegram, находит
  // привязанный кабинет и ставит сессию. Пароль не нужен — привязку чата
  // мастер уже подтверждал из кабинета. true — уходим на страницу кабинета.
  const enterCabinet = useCallback(async (initData: string) => {
    try {
      const response = await fetch("/api/telegram/miniapp/master-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const payload = (await response.json()) as { ok?: boolean; redirectTo?: string };

      if (payload.ok && payload.redirectTo) {
        window.location.assign(payload.redirectTo);
        return true;
      }

      setCabinetError("Не получилось открыть кабинет. Попробуй ещё раз или войди на сайте.");
    } catch {
      setCabinetError("Нет связи. Проверь интернет и попробуй ещё раз.");
    }

    return false;
  }, []);

  // Первая загрузка: клиенту — его приложение, мастеру — сразу кабинет.
  const start = useCallback(
    async (initData: string) => {
      const data = await load(initData);

      if (!data) {
        return;
      }

      if (data.master && !isClientMode() && !isTelegramWeb()) {
        setState({ kind: "cabinet" });

        if (await enterCabinet(initData)) {
          return;
        }
      }

      setState({ kind: "ready", data });
    },
    [enterCabinet, load],
  );

  // Точка входа — загрузка SDK, а не монтирование компонента: Telegram кладёт
  // initData в window при выполнении скрипта, и раньше читать всё равно нечего.
  const handleSdkReady = useCallback(() => {
    const webApp = getWebApp();

    // Страницу открыли не из Telegram — например, перешли по ссылке в
    // браузере. Подписи нет, показывать нечего, и притворяться не нужно.
    if (!webApp?.initData) {
      setState({ kind: "outside" });
      return;
    }

    setInitData(webApp.initData);
    setTab(readStoredTab());
    webApp.ready();
    webApp.expand();
    syncTelegramChrome();
    void start(webApp.initData);
  }, [start]);

  // Перечитать данные после действия, которое их меняет: отзыв, привязанный
  // сертификат, подтверждённый номер. Экран при этом не сбрасываем в скелетон
  // — человек остаётся там, где был, и просто видит обновлённые данные.
  const reload = useCallback(() => {
    void load(initData).then((data) => {
      if (data) {
        setState({ kind: "ready", data });
      }
    });
  }, [initData, load]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    void start(initData);
  }, [initData, start]);

  const changeTab = useCallback((next: TabId) => {
    hapticSelect();
    setTab(next);
    window.scrollTo({ top: 0 });

    try {
      window.sessionStorage.setItem(tabStorageKey, next);
    } catch {
      // Приватный режим: вкладка просто не запомнится.
    }
  }, []);

  const openCabinet = useCallback(async () => {
    // В веб-версии сессию во фрейме не поставить — открываем кабинет вкладкой
    // браузера, где мастер уже вошёл или войдёт по паролю.
    if (isTelegramWeb()) {
      openExternal(`${window.location.origin}/dashboard`);
      return;
    }

    setCabinetBusy(true);
    setCabinetError("");

    if (!(await enterCabinet(initData))) {
      setCabinetBusy(false);
    }
  }, [enterCabinet, initData]);

  // Ссылки внутри приложения — обычные <a>: в мобильном клиенте они
  // открываются в том же вебвью. В веб-версии перехватываем клик и открываем
  // новой вкладкой (см. isTelegramWeb).
  const handleLinkClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isTelegramWeb()) {
      return;
    }

    const link = (event.target as HTMLElement).closest("a[href]");

    if (link instanceof HTMLAnchorElement) {
      event.preventDefault();
      openExternal(link.href);
    }
  }, []);

  // Родная кнопка «Назад» Telegram: на любой вкладке, кроме главной, она
  // возвращает на главную. Это синхронизация с внешней системой (шапкой
  // клиента), поэтому эффект, а не обработчик.
  const isReady = state.kind === "ready";
  useEffect(() => {
    const backButton = getWebApp()?.BackButton;

    if (!backButton || !isReady || tab === "home") {
      backButton?.hide();
      return;
    }

    const goHome = () => changeTab("home");
    backButton.onClick(goHome);
    backButton.show();

    return () => {
      backButton.offClick(goHome);
    };
  }, [changeTab, isReady, tab]);

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
        <LoadingSkeleton />
      </>
    );
  }

  if (state.kind === "cabinet") {
    return <LoadingSkeleton label="Открываю кабинет…" />;
  }

  if (state.kind === "outside") {
    return (
      <div className="space-y-3 py-24 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">okno</p>
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
          Приложение для Telegram
        </h1>
        <p className="text-sm leading-6 text-ink-soft">
          Эта страница открывается внутри Telegram — из чата с ботом okno.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="space-y-4 py-24 text-center">
        <p className="text-sm leading-6 text-ink-soft">{state.message}</p>
        <Button variant="secondary" onClick={retry} className="gap-2">
          <RefreshCw size={14} />
          Обновить
        </Button>
      </div>
    );
  }

  const { data } = state;
  const preferredCity =
    data.bookings[0]?.city || data.past[0]?.city || null;

  return (
    <>
      {/* key перезапускает анимацию появления при смене вкладки. */}
      <div key={tab} className="tg-tab-in pb-28 pt-5" onClick={handleLinkClick}>
        {cabinetError ? (
          <p
            role="alert"
            className="mb-4 rounded-panel border border-line bg-warning-soft px-4 py-3 text-sm leading-6 text-warning"
          >
            {cabinetError}
          </p>
        ) : null}

        {tab === "home" ? (
          <HomeTab
            data={data}
            initData={initData}
            onReload={reload}
            onNavigate={changeTab}
            onOpenCabinet={() => void openCabinet()}
            cabinetBusy={cabinetBusy}
          />
        ) : null}
        {tab === "search" ? (
          <SearchTab initData={initData} preferredCity={preferredCity} />
        ) : null}
        {tab === "visits" ? (
          <VisitsTab
            data={data}
            initData={initData}
            onReload={reload}
            onNavigate={changeTab}
          />
        ) : null}
        {tab === "profile" ? (
          <ProfileTab
            data={data}
            initData={initData}
            onReload={reload}
            onOpenCabinet={() => void openCabinet()}
            cabinetBusy={cabinetBusy}
          />
        ) : null}
      </div>

      <TabBar
        active={tab}
        onChange={changeTab}
        badges={{ visits: data.bookings.length + data.pendingPayment.length }}
      />
    </>
  );
}

// Скелетон повторяет главную: приветствие, крупная карточка визита, лента
// мастеров. Так загрузка читается как «приложение открывается», а не как
// пустая страница с надписью.
function LoadingSkeleton({ label }: { label?: string }) {
  return (
    <div
      className="space-y-6 pb-28 pt-5"
      aria-busy
      aria-label={label ?? "Загружаем приложение"}
    >
      {label ? <p className="text-sm font-medium text-ink-soft">{label}</p> : null}
      <div className="space-y-2">
        <div className="h-3 w-12 animate-pulse rounded-full bg-panel" />
        <div className="h-7 w-44 animate-pulse rounded-full bg-panel" />
      </div>
      <div className="h-56 animate-pulse rounded-card bg-panel" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-40 w-40 shrink-0 animate-pulse rounded-card bg-panel" />
        ))}
      </div>
    </div>
  );
}
