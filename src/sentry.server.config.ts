import * as Sentry from "@sentry/nextjs";
import { env, isSentryConfigured } from "@/lib/env";

if (isSentryConfigured) {
  Sentry.init({
    dsn: env.sentryDsn,
    sendDefaultPii: false,
    tracesSampleRate:
      Number(env.sentryTracesSampleRate ?? "") ||
      (process.env.NODE_ENV === "development" ? 1 : 0.1),
  });
}
