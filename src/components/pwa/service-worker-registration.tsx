"use client";

import { useEffect } from "react";

// Регистрирует public/sw.js. В dev воркер мешал бы горячей перезагрузке
// (отдавал бы закэшированные чанки), поэтому только в продакшене.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Без воркера сайт работает как обычно — просто без офлайн-экрана.
      });
  }, []);

  return null;
}
