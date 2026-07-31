"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  idleLabel,
  pendingLabel,
  className,
  disabled = false,
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      style={{
        backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
        color: "var(--ui-primary-text)",
      }}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
      disabled={pending || disabled}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function FormMessage({
  message,
  success = false,
}: {
  message?: string;
  success?: boolean;
}) {
  if (!message) return null;

  return (
    <p
      style={
        success
          ? {
              backgroundColor: "var(--color-success-soft)",
              color: "var(--color-success)",
            }
          : {
              backgroundColor: "var(--color-warning-soft)",
              color: "var(--color-warning)",
            }
      }
      className="rounded-field px-4 py-3 text-sm"
    >
      {message}
    </p>
  );
}
