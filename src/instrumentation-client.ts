import * as Sentry from "@sentry/nextjs";
import { env, isSentryConfigured } from "@/lib/env";
import { reportClientError } from "@/lib/observability/client-report";
import { reportError } from "@/lib/observability/logger";

if (isSentryConfigured) {
  Sentry.init({
    dsn: env.sentryDsn,
    sendDefaultPii: false,
    tracesSampleRate:
      Number(env.sentryTracesSampleRate ?? "") ||
      (process.env.NODE_ENV === "development" ? 1 : 0.1),
    replaysSessionSampleRate: Number(env.sentryReplaysSessionSampleRate ?? "") || 0,
    replaysOnErrorSampleRate:
      Number(env.sentryReplaysOnErrorSampleRate ?? "") || 1,
  });
}

window.addEventListener("error", (event) => {
  const error = event.error ?? new Error(event.message);
  reportError(error, { source: "window.error" });
  reportClientError(error, { context: { source: "window.error" } });
});

window.addEventListener("unhandledrejection", (event) => {
  reportError(event.reason, { source: "window.unhandledrejection" });
  reportClientError(event.reason, {
    context: { source: "window.unhandledrejection" },
  });
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
