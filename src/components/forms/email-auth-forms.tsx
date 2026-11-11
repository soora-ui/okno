"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  confirmEmailLinkAction,
  requestPasswordResetAction,
  resendConfirmationAction,
  updatePasswordAction,
} from "@/app/actions/auth";
import { initialAuthActionState } from "@/components/forms/auth-state";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Input } from "@/components/ui/input";

// Формы подтверждения почты и сброса пароля (письма — /api/auth/send-email).

export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(resendConfirmationAction, initialAuthActionState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      <FormMessage message={state.message} success={state.success} />
      <ResendButton />
    </form>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Отправляю..." : "Отправить письмо ещё раз"}
    </button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialAuthActionState);

  return (
    <form action={formAction} className="space-y-4">
      <Input label="Email" name="email" type="email" placeholder="you@example.com" required />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel="Прислать ссылку" pendingLabel="Отправляю..." className="w-full" />
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, initialAuthActionState);

  return (
    <form action={formAction} className="space-y-4">
      <Input
        label="Новый пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        placeholder="Не короче 8 символов"
        required
      />
      <Input
        label="Ещё раз"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton idleLabel="Сохранить и войти" pendingLabel="Сохраняю..." className="w-full" />
    </form>
  );
}

export function ConfirmLinkForm({
  tokenHash,
  type,
  label,
}: {
  tokenHash: string;
  type: string;
  label: string;
}) {
  const [state, formAction] = useActionState(confirmEmailLinkAction, initialAuthActionState);

  if (state.success) {
    return <FormMessage message={state.message} success />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <FormMessage message={state.message} success={false} />
      <SubmitButton idleLabel={label} pendingLabel="Проверяю..." className="w-full" />
    </form>
  );
}
