"use client";

import { useActionState, useRef, useState } from "react";
import { Link2 } from "lucide-react";
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
import { publicLinkHost, suggestUsername } from "@/lib/site";

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

export function RegisterForm({
  referralCode = null,
}: {
  referralCode?: string | null;
}) {
  const [state, formAction] = useActionState(
    registerMasterAction,
    initialAuthActionState,
  );
  const values = state.values;
  const [accountMode, setAccountMode] = useState<AccountMode>(
    (values?.accountMode as AccountMode) ?? "solo",
  );
  const isSolo = accountMode === "solo";

  // Публичная ссылка автогенерируется от имени и ниши, пока мастер не
  // отредактирует её вручную. Имя/ниша — неконтролируемые поля, поэтому их
  // текущие значения держим в ref и пересчитываем ссылку по onChange.
  const nameParts = useRef({
    fullName: values?.fullName ?? "",
    specialty: values?.specialty ?? "",
  });
  const [username, setUsername] = useState(values?.username ?? "");
  const [usernameEdited, setUsernameEdited] = useState(
    Boolean(values?.username),
  );

  function refreshSuggestedUsername() {
    if (usernameEdited) return;
    setUsername(
      suggestUsername(nameParts.current.fullName, nameParts.current.specialty),
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="accountMode" value={accountMode} />
      {referralCode ? (
        <input type="hidden" name="referralCode" value={referralCode} />
      ) : null}

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
            defaultValue={values?.workspaceName}
            required
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={isSolo ? "Имя мастера" : "Имя администратора"}
            name="fullName"
            placeholder={isSolo ? "Алина" : "Алина Мороз"}
            defaultValue={values?.fullName}
            onChange={(event) => {
              nameParts.current.fullName = event.target.value;
              refreshSuggestedUsername();
            }}
            required
          />
          <Input
            label={isSolo ? "Ниша" : "Роль или специализация"}
            name="specialty"
            placeholder={isSolo ? "Маникюр и брови" : "Управляющий студией"}
            defaultValue={values?.specialty}
            onChange={(event) => {
              nameParts.current.specialty = event.target.value;
              refreshSuggestedUsername();
            }}
            required
          />
          <Input
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            defaultValue={values?.email}
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
            placeholder={isSolo ? "alina-manikyur" : "alina-admin"}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setUsernameEdited(true);
            }}
            hint={
              isSolo
                ? "Сгенерировали от имени и ниши — можно изменить на свою."
                : "Нужен для входа и личного кабинета администратора."
            }
            required
          />
          <Select
            label="Город"
            name="city"
            defaultValue={values?.city || defaultCityValue}
            options={cityOptions}
            hint="Часовой пояс определим автоматически. Точный адрес добавишь в кабинете."
          />
        </div>

        {isSolo ? (
          <div className="flex items-center gap-3 rounded-[18px] bg-panel px-4 py-3">
            <Link2 size={18} className="shrink-0 text-accent-deep" />
            <p className="truncate text-sm font-medium text-ink">
              {publicLinkHost}/{username || "ваша-ссылка"}
            </p>
          </div>
        ) : null}
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
              defaultValue={values?.serviceTitle}
              required
            />
            <Input
              label="Цена"
              name="servicePrice"
              type="number"
              placeholder="1900"
              defaultValue={values?.servicePrice}
              required
            />
            <Input
              label="Длительность, мин"
              name="serviceDurationMinutes"
              type="number"
              placeholder="120"
              defaultValue={values?.serviceDurationMinutes}
              required
            />
          </div>

          <Textarea
            label="Краткое описание"
            name="serviceDescription"
            placeholder="Включает покрытие, без дизайна"
            hint="Это описание будет видно клиенту на публичной странице."
            defaultValue={values?.serviceDescription}
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
