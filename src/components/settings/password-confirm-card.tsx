"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { confirmPasswordAction } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialState = { success: false, message: "" };

// Кабинет открыт из Telegram без пароля. Записи, клиенты и настройки доступны
// сразу, а оплата тарифа и ЮKassa — после этого подтверждения: доступ к
// Telegram мастера не должен давать доступ к его деньгам.
export function PasswordConfirmCard() {
  const [state, action] = useActionState(confirmPasswordAction, initialState);

  return (
    <Card className="bg-panel">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
          <ShieldCheck size={18} />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Кабинет открыт из Telegram</p>
          <p className="text-sm leading-6 text-ink-soft">
            Записи, клиенты и настройки работают как обычно. Оплата тарифа,
            автоплатёж и ЮKassa откроются после ввода пароля от кабинета.
          </p>
        </div>
      </div>
      <form action={action} className="mt-4 space-y-3">
        <Input
          label="Пароль от кабинета"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormMessage message={state.message} success={state.success} />
        <SubmitButton idleLabel="Подтвердить пароль" pendingLabel="Проверяю..." />
      </form>
    </Card>
  );
}
