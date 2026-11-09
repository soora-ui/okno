import { env, isSentryConfigured } from "@/lib/env";
import { reportClientError } from "@/lib/observability/client-report";
import { reportError } from "@/lib/observability/logger";

// Sentry подгружается отдельным чанком после загрузки страницы, а не входит в
// стартовый JS: SDK весит ~128 КБ gzip — около трети всего скрипта лендинга и
// страницы записи. Ошибки, случившиеся до его загрузки, не теряются: их сразу
// принимает свой приёмник (/api/observability/client-error), а в Sentry они
// уходят из буфера, как только SDK инициализирован.
type SentryModule = typeof import("@sentry/nextjs");

const EARLY_ERRORS_LIMIT = 10;
const earlyErrors: unknown[] = [];
let sentry: SentryModule | null = null;

function loadSentry() {
  void import("@sentry/nextjs")
    .then((loaded) => {
      loaded.init({
        dsn: env.sentryDsn,
        sendDefaultPii: false,
        tracesSampleRate:
          Number(env.sentryTracesSampleRate ?? "") ||
          (process.env.NODE_ENV === "development" ? 1 : 0.1),
        replaysSessionSampleRate: Number(env.sentryReplaysSessionSampleRate ?? "") || 0,
        replaysOnErrorSampleRate:
          Number(env.sentryReplaysOnErrorSampleRate ?? "") || 1,
      });
      sentry = loaded;

      for (const error of earlyErrors.splice(0)) {
        loaded.captureException(error);
      }
    })
    .catch(() => {
      // Чанк не загрузился (сеть, блокировщик) — свой приёмник ошибок работает.
    });
}

function scheduleSentry() {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(loadSentry, { timeout: 5000 });
    return;
  }

  // Safari до 16.4 не знает requestIdleCallback.
  window.setTimeout(loadSentry, 2000);
}

if (isSentryConfigured) {
  if (document.readyState === "complete") {
    scheduleSentry();
  } else {
    window.addEventListener("load", scheduleSentry, { once: true });
  }
}

// После инициализации Sentry сам ловит необработанные ошибки; до неё — буфер.
function rememberEarlyError(error: unknown) {
  if (isSentryConfigured && !sentry && earlyErrors.length < EARLY_ERRORS_LIMIT) {
    earlyErrors.push(error);
  }
}

window.addEventListener("error", (event) => {
  const error = event.error ?? new Error(event.message);
  rememberEarlyError(error);
  reportError(error, { source: "window.error" });
  reportClientError(error, { context: { source: "window.error" } });
});

window.addEventListener("unhandledrejection", (event) => {
  rememberEarlyError(event.reason);
  reportError(event.reason, { source: "window.unhandledrejection" });
  reportClientError(event.reason, {
    context: { source: "window.unhandledrejection" },
  });
});

// Next зовёт этот хук на каждом переходе; до загрузки SDK он ничего не делает.
export function onRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  sentry?.captureRouterTransitionStart(...args);
}
