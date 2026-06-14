"use client";

import { useActionState, useState } from "react";
import { registerMasterAction } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { initialAuthActionState } from "@/components/forms/auth-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cityOptions,
  defaultCityValue,
} from "@/lib/cities";

const accountModes = [
  {
    value: "solo",
    title: "Одиночный мастер",
    description: "Свой кабинет, первая услуга и личная ссылка для записи.",
  },
  {
    value: "studio",
    title: "Студия",
    description: "Администратор создает сотрудников и следит за всей командой.",
  },
  {
    value: "barbershop",
    title: "Барбершоп",
    description: "Подходит для команды с разными мастерами и отдельными кабинетами.",
  },
  {
    value: "company",
    title: "Компания",
    description: "Для салона, сети или бренда, где нужны роли и общая админка.",
  },
] as const;

type AccountMode = (typeof accountModes)[number]["value"];

export function RegisterForm() {
  const [state, formAction] = useActionState(
    registerMasterAction,
    initialAuthActionState,
  );
  const [accountMode, setAccountMode] = useState<AccountMode>("solo");
  const isSolo = accountMode === "solo";

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="accountMode" value={accountMode} />

      <Card className="space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-muted">
            Формат аккаунта
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Как ты будешь работать в okno
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {accountModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setAccountMode(mode.value)}
              className={`rounded-[24px] border px-4 py-4 text-left transition ${
                accountMode === mode.value
                  ? "border-ink bg-panel shadow-sm"
                  : "border-line bg-surface hover:border-ink-soft"
              }`}
            >
              <p className="font-medium text-ink">{mode.title}</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                {mode.description}
              </p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-muted">
            Шаг 1
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            {isSolo ? "Личный кабинет и вход" : "Администратор и компания"}
          </h2>
        </div>

        {!isSolo ? (
          <Input
            label="Название студии или компании"
            name="workspaceName"
            placeholder="okno studio"
            hint="Это имя появится в админке и у сотрудников."
            required
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={isSolo ? "Имя мастера" : "Имя администратора"}
            name="fullName"
            placeholder={isSolo ? "Алина" : "Алина Мороз"}
            required
          />
          <Input
            label={isSolo ? "Ниша" : "Роль или специализация"}
            name="specialty"
            placeholder={isSolo ? "Маникюр и брови" : "Управляющий студией"}
            required
          />
          <Input
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
          />
          <Input
            label="Пароль"
            name="password"
            type="password"
            placeholder="Минимум 8 символов"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={isSolo ? "Публичная ссылка" : "Username администратора"}
            name="username"
            placeholder={isSolo ? "alina-nails" : "alina-admin"}
            hint={
              isSolo
                ? "Эту ссылку ты будешь отправлять клиентам."
                : "Нужен для входа и личного кабинета администратора."
            }
            required
          />
          <Select
            label="Город"
            name="city"
            defaultValue={defaultCityValue}
            options={cityOptions}
            hint="Часовой пояс определим автоматически по выбранному городу."
          />
        </div>
      </Card>

      {isSolo ? (
        <Card className="space-y-5">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-muted">
              Шаг 2
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Первая услуга
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Название услуги"
              name="serviceTitle"
              placeholder="Маникюр с покрытием"
              required
            />
            <Input
              label="Цена"
              name="servicePrice"
              type="number"
              placeholder="1900"
              required
            />
            <Input
              label="Длительность, мин"
              name="serviceDurationMinutes"
              type="number"
              placeholder="120"
              required
            />
          </div>

          <Textarea
            label="Краткое описание"
            name="serviceDescription"
            placeholder="Включает покрытие, без дизайна"
            hint="Это описание будет видно клиенту на публичной странице."
          />
        </Card>
      ) : (
        <Card className="space-y-4 bg-panel">
          <p className="text-sm font-medium text-ink">
            После регистрации администратор сразу попадет в отдельную админку.
          </p>
          <p className="text-sm leading-6 text-ink-soft">
            Там можно создать сотрудников, выдать им логины и пароли, а затем
            следить за их ближайшими записями, клиентами и загрузкой команды.
          </p>
        </Card>
      )}

      <FormMessage message={state.message} success={state.success} />
      <SubmitButton
        idleLabel={
          isSolo
            ? "Создать аккаунт и перейти в кабинет"
            : "Создать админку и открыть команду"
        }
        pendingLabel={isSolo ? "Создаю аккаунт..." : "Поднимаю админку..."}
      />
    </form>
  );
}
