// Telegram кладёт свой SDK в window при запуске мини-аппа. Типизируем ровно
// то, чем пользуемся: описывать весь интерфейс ради десятка вызовов незачем.
// Всё, что появилось позже первой версии SDK, помечено необязательным — на
// старом клиенте метода может не быть, и приложение должно работать без него.

type TelegramBackButton = {
  show: () => void;
  hide: () => void;
  onClick: (handler: () => void) => void;
  offClick: (handler: () => void) => void;
};

type TelegramHaptics = {
  impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred: (type: "error" | "success" | "warning") => void;
  selectionChanged: () => void;
};

export type TelegramWebApp = {
  initData: string;
  platform?: string;
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
  requestContact?: (callback: (shared: boolean) => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  BackButton?: TelegramBackButton;
  HapticFeedback?: TelegramHaptics;
};

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }

  const telegram = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } })
    .Telegram;

  return telegram?.WebApp ?? null;
}

function supports(webApp: TelegramWebApp, version: string) {
  return webApp.isVersionAtLeast ? webApp.isVersionAtLeast(version) : false;
}

// Открыть ссылку наружу, а не внутри вебвью. Нужно оплате: 3-D Secure уводит
// в банковское приложение, откуда возврата в мини-апп нет. Вне Telegram
// (отладка в браузере) — обычная новая вкладка.
export function openExternal(url: string) {
  const webApp = getWebApp();

  if (webApp?.openLink) {
    webApp.openLink(url);
    return;
  }

  window.open(url, "_blank", "noopener");
}

// Шапка и подложка окна Telegram красятся в фон страницы: иначе над тёплой
// бумагой висит белая (или синяя) полоса клиента, и приложение выглядит
// вставленной веб-страницей. Цвет читаем из токена, поэтому тёмная тема
// подхватывается сама.
export function syncTelegramChrome() {
  const webApp = getWebApp();

  if (!webApp) {
    return;
  }

  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue("--color-background").trim();
  const surface = styles.getPropertyValue("--color-surface").trim();

  if (!/^#[0-9a-f]{6}$/i.test(background)) {
    return;
  }

  if (supports(webApp, "6.1")) {
    webApp.setHeaderColor?.(background);
    webApp.setBackgroundColor?.(background);
  }

  if (supports(webApp, "7.10") && /^#[0-9a-f]{6}$/i.test(surface)) {
    webApp.setBottomBarColor?.(surface);
  }
}

// Вибро-отклик. На десктопе и старых клиентах метода нет — молча пропускаем.
export function hapticSelect() {
  const webApp = getWebApp();

  if (webApp && supports(webApp, "6.1")) {
    webApp.HapticFeedback?.selectionChanged();
  }
}

export function hapticImpact() {
  const webApp = getWebApp();

  if (webApp && supports(webApp, "6.1")) {
    webApp.HapticFeedback?.impactOccurred("light");
  }
}

export function hapticSuccess() {
  const webApp = getWebApp();

  if (webApp && supports(webApp, "6.1")) {
    webApp.HapticFeedback?.notificationOccurred("success");
  }
}

// Веб-версия Telegram показывает мини-апп в iframe. Остальные страницы сайта
// встраивать в чужой фрейм запрещено (X-Frame-Options, см. next.config.ts), а
// cookie сессии во фрейме браузер не сохранит. Поэтому там переходы на
// страницу мастера, запись и кабинет открываются новой вкладкой.
export function isTelegramWeb() {
  const platform = getWebApp()?.platform ?? "";

  return platform === "weba" || platform === "webk" || platform === "web";
}
