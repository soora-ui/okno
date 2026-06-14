"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { TeamMemberSummary } from "@/lib/data";
import {
  createTeamMemberAction,
  toggleTeamMemberStatusAction,
  type TeamActionState,
  updateTeamMemberAction,
  updateWorkspaceSettingsAction,
} from "@/app/actions/team";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  cityOptions,
  resolveCityValue,
} from "@/lib/cities";
import { workspaceKindValues, type WorkspaceKind } from "@/lib/workspace";

const initialState: TeamActionState = {
  success: false,
  message: "",
};

const workspaceKindOptions = workspaceKindValues.map((value) => ({
  value,
  label:
    value === "studio"
      ? "Студия"
      : value === "barbershop"
        ? "Барбершоп"
        : value === "company"
          ? "Компания"
          : "Одиночный мастер",
}));

export function WorkspaceSettingsForm({
  workspaceName,
  workspaceKind,
}: {
  workspaceName: string;
  workspaceKind: WorkspaceKind;
}) {
  const [state, formAction] = useActionState(
    updateWorkspaceSettingsAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Input
        label="Название студии"
        name="workspaceName"
        defaultValue={workspaceName}
        required
      />
      <Select
        label="Тип бизнеса"
        name="workspaceKind"
        defaultValue={workspaceKind}
        options={workspaceKindOptions.filter((option) => option.value !== "solo")}
      />
      <FormMessage message={state.message} success={state.success} />
      <SubmitButton
        idleLabel="Сохранить настройки студии"
        pendingLabel="Сохраняю..."
      />
    </form>
  );
}

export function CreateTeamMemberForm({ defaultCity }: { defaultCity: string }) {
  const [state, formAction] = useActionState(
    createTeamMemberAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Имя сотрудника"
          name="fullName"
          placeholder="Иван Петров"
          required
        />
        <Input
          label="Роль или специализация"
          name="specialty"
          placeholder="Барбер / колорист / мастер маникюра"
          required
        />
        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="team@example.com"
          required
        />
        <Input
          label="Пароль"
          name="password"
          type="password"
          placeholder="Минимум 8 символов"
          required
        />
        <Input
          label="Username"
          name="username"
          placeholder="ivan-barber"
          hint="Нужен для входа и личного кабинета сотрудника."
          required
        />
        <Select
          label="Город"
          name="city"
          defaultValue={defaultCity}
          options={cityOptions}
          hint="Часовой пояс сотрудника определим автоматически."
        />
      </div>

      <FormMessage message={state.message} success={state.success} />
      <SubmitButton
        idleLabel="Создать сотрудника"
        pendingLabel="Создаю..."
      />
    </form>
  );
}

export function TeamMemberCard({
  member,
  currentProfileId,
}: {
  member: TeamMemberSummary;
  currentProfileId: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editState, editAction] = useActionState(
    updateTeamMemberAction,
    initialState,
  );
  const [statusState, statusAction] = useActionState(
    toggleTeamMemberStatusAction,
    initialState,
  );
  const canDisable = member.id !== currentProfileId;

  return (
    <div className="rounded-[24px] border border-line bg-panel px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{member.fullName}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {member.roleLabel} · {member.specialty}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              member.accountStatus === "disabled"
                ? "border-[#d8b1b1] bg-[#fff5f5] text-[#b14f4f]"
                : "border-line bg-surface text-ink-soft"
            }`}
          >
            {member.statusLabel}
          </span>
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft">
            {member.accountRole === "admin" ? "Админка" : "Личный кабинет"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-ink-soft sm:grid-cols-2">
        <p>{member.clientCount} клиентов</p>
        <p>{member.activeServicesCount} активных услуг</p>
        <p>{member.upcomingBookingsCount} будущих записей</p>
        <p>
          {member.nextBookingLabel
            ? `Следующая запись: ${member.nextBookingLabel}`
            : "Пока без записей"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-ink-soft">{member.email}</span>
        <span className="text-ink-soft">@{member.username}</span>
        <span className="text-ink-soft">С {member.joinedAtLabel}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditOpen((value) => !value)}
        >
          {editOpen ? "Свернуть" : "Редактировать"}
        </Button>

        {canDisable ? (
          <form action={statusAction}>
            <input type="hidden" name="memberProfileId" value={member.id} />
            <input
              type="hidden"
              name="nextStatus"
              value={member.accountStatus === "active" ? "disabled" : "active"}
            />
            <SubmitButton
              idleLabel={
                member.accountStatus === "active"
                  ? "Отключить кабинет"
                  : "Включить кабинет"
              }
              pendingLabel={
                member.accountStatus === "active"
                  ? "Отключаю..."
                  : "Включаю..."
              }
            />
          </form>
        ) : (
          <div className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-5 py-3 text-sm font-medium text-ink-soft">
            Свой кабинет нельзя отключить здесь
          </div>
        )}
      </div>

      <FormMessage message={statusState.message} success={statusState.success} />

      {editOpen ? (
        <form action={editAction} className="mt-5 space-y-4 rounded-[20px] border border-line bg-surface p-4">
          <input type="hidden" name="memberProfileId" value={member.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Имя сотрудника"
              name="fullName"
              defaultValue={member.fullName}
              required
            />
            <Input
              label="Роль или специализация"
              name="specialty"
              defaultValue={member.specialty}
              required
            />
            <Input
              label="Email"
              name="email"
              type="email"
              defaultValue={member.email}
              required
            />
            <Input
              label="Username"
              name="username"
              defaultValue={member.username}
              required
            />
            <Select
              label="Город"
              name="city"
              defaultValue={resolveCityValue({
                locationText: member.locationText,
                timezone: member.timezone,
              })}
              options={cityOptions}
            />
            <Input
              label="Новый пароль"
              name="password"
              type="password"
              placeholder="Оставь пустым, если менять не нужно"
              hint="Если ввести новый пароль, старый перестанет работать."
            />
          </div>
          <FormMessage message={editState.message} success={editState.success} />
          <SubmitButton
            idleLabel="Сохранить сотрудника"
            pendingLabel="Сохраняю..."
          />
        </form>
      ) : null}
    </div>
  );
}
