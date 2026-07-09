// Отправка клиентской ошибки на серверный приёмник /api/observability/
// client-error, откуда она попадает в ленту ошибок админки. Best-effort: любые
// сбои отправки молча игнорируем, чтобы не множить ошибки в обработчике ошибок.

type ClientErrorReport = {
  message?: string;
  route?: string;
  digest?: string;
  context?: Record<string, unknown>;
};

export function reportClientError(input: unknown, extra?: ClientErrorReport) {
  if (typeof window === "undefined") {
    return;
  }

  const error =
    input instanceof Error
      ? input
      : new Error(typeof input === "string" ? input : "Unknown client error");

  const payload = JSON.stringify({
    message: extra?.message ?? error.message,
    route: extra?.route ?? window.location?.pathname,
    digest: extra?.digest,
    context: { name: error.name, ...extra?.context },
  });

  try {
    const url = "/api/observability/client-error";
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // молча игнорируем
  }
}
