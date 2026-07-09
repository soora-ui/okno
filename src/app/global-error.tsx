"use client";

import { useEffect } from "react";
import NextError from "next/error";
import * as Sentry from "@sentry/nextjs";
import { reportClientError } from "@/lib/observability/client-report";
import { reportError } from "@/lib/observability/logger";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
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
