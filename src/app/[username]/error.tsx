"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/observability/logger";

export default function PublicProfileError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { route: "app.public_profile_error_boundary" });
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-[32px] border border-line bg-surface p-8 shadow-[0_30px_80px_rgba(35,36,31,0.08)]">
        <p className="text-sm uppercase tracking-[0.24em] text-muted">
          Публичная страница недоступна
        </p>
        <h1 className="text-3xl font-semibold text-ink">
          Не получилось загрузить профиль мастера
        </h1>
        <p className="max-w-2xl text-base leading-7 text-ink-soft">
          Либо мастерская страница сейчас временно недоступна, либо есть проблема
          со связью с базой. Попробуй обновить экран чуть позже.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-medium transition-transform hover:-translate-y-0.5"
            style={{
              backgroundColor: "var(--color-ink, #23241f)",
              color: "#fff",
            }}
          >
            Повторить
          </button>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center rounded-full border px-6 text-sm font-medium"
            style={{
              borderColor: "var(--color-line, #d7c7b2)",
              color: "var(--color-ink, #23241f)",
              backgroundColor: "#fff",
            }}
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
