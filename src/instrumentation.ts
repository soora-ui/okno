import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { reportError } from "@/lib/observability/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const errorDigest =
    error && typeof error === "object" && "digest" in error
      ? String(error.digest ?? "")
      : undefined;

  reportError(error, {
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    requestPath: request.path,
    requestMethod: request.method,
    digest: errorDigest,
  });

  await Sentry.captureRequestError(error, request, context);
};
