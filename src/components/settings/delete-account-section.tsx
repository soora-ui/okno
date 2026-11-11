"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAccountAction, type DeleteAccountState } from "@/app/actions/account";
import { FormMessage } from "@/components/forms/auth-form-state";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/mock-data";
import { canManageWorkspace, isTeamWorkspaceKind } from "@/lib/workspace";

const initialState: DeleteAccountState = { success: false, message: "" };

const dangerButtonClass =
  "inline-flex min-h-11 items-center justify-center self-start rounded-full border border-[var(--color-danger-border)] px-5 py-3 text-sm font-medium text-[var(--color-danger)] transition duration-300 hover:bg-[var(--color-danger-soft)] disabled:cursor-not-allowed disabled:opacity-60";

function ConfirmDeleteButton() {
  const { pending } = useFormStatus();

  // Без data-submit: общая панель сохранения настроек прячет такие кнопки,
  // а удаление аккаунта к ней отношения не имеет.
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-danger)] px-5 py-3 text-sm font-medium text-white transition duration-300 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Удаляю..." : "Удалить навсегда"}
    </button>
  );
}

export function DeleteAccountSection({ profile }: { profile: Profile }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(deleteAccountAction, initialState);
  const passwordRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirming) {
      passwordRef.current?.querySelector("input")?.focus();
    }
  }, [confirming]);

  if (profile.accountRole === "staff") {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Аккаунт сотрудника удаляет администратор студии.
      </p>
    );
  }

  const deletesStudio =
    canManageWorkspace(profile.accountRole) && isTeamWorkspaceKind(profile.workspaceKind);

  if (!confirming) {
    return (
      <button type="button" className={dangerButtonClass} onClick={() => setConfirming(true)}>
        Удалить аккаунт
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-[var(--color-danger)]">
        {deletesStudio
          ? "Вместе с твоим аккаунтом удалятся студия и аккаунты всех сотрудников. Отменить это нельзя."
          : "Страница записи перестанет открываться, а записи, клиенты и услуги удалятся. Отменить это нельзя."}
      </p>
      <div ref={passwordRef}>
        <Input
          label="Пароль от кабинета"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Введи пароль для подтверждения"
          required
        />
      </div>
      <FormMessage message={state.message} success={state.success} />
      <div className="flex flex-wrap gap-3">
        <ConfirmDeleteButton />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-line)] px-5 py-3 text-sm font-medium transition duration-300 hover:bg-[var(--color-surface-strong)]"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
