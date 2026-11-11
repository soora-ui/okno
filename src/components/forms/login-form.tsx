"use client";

import { useActionState } from "react";
import {
  loginMasterAction,
} from "@/app/actions/auth";
import { initialAuthActionState } from "@/components/forms/auth-state";
import { Input } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { ResendConfirmationForm } from "@/components/forms/email-auth-forms";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useActionState(
    loginMasterAction,
    initialAuthActionState,
  );

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-4">
        {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
        <Input label="Email" name="email" type="email" placeholder="you@example.com" required />
        <Input label="Пароль" name="password" type="password" placeholder="Введите пароль" required />
        <FormMessage message={state.message} success={state.success} />
        <SubmitButton idleLabel="Войти" pendingLabel="Вхожу..." className="w-full" />
      </form>
      {/* Почта не подтверждена — даём отправить письмо ещё раз прямо здесь. */}
      {state.confirmEmail ? <ResendConfirmationForm email={state.confirmEmail} /> : null}
    </div>
  );
}
