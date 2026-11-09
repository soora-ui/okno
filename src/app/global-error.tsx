"use client";

import { useEffect } from "react";
import NextError from "next/error";
import { reportClientError } from "@/lib/observability/client-report";
import { reportError } from "@/lib/observability/logger";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // Динамический импорт: SDK не должен попадать в стартовый JS страниц
    // (см. src/instrumentation-client.ts).
    void import("@sentry/nextjs")
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => {});
    reportError(error, { route: "app.global_error_boundary" });
    reportClientError(error, {
      route: "app.global_error_boundary",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="ru">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
