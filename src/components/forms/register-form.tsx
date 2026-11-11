"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Check,
  CircleCheck,
  Lightbulb,
  Link2,
  Mail,
  Search,
  User,
  Users,
} from "lucide-react";
import { registerMasterAction, type RegisterField } from "@/app/actions/auth";
import { initialAuthActionState } from "@/components/forms/auth-state";
import { FormMessage } from "@/components/forms/auth-form-state";
import { ResendConfirmationForm } from "@/components/forms/email-auth-forms";
import { CityPicker } from "@/components/ui/city-picker";
import { Input } from "@/components/ui/input";
import { publicLinkHost, suggestUsername } from "@/lib/site";
import { defaultAccountMode, type AccountMode } from "@/lib/account-modes";
import { cn } from "@/lib/utils";

type StepId = "format" | "about" | "link" | "service" | "login";

const stepNames: Record<StepId, string> = {
  format: "Формат",
  about: "О тебе",
  link: "Ссылка",
  service: "Услуга",
  login: "Вход",
};

// На каком шаге живёт поле: ошибка с сервера возвращает человека туда.
const fieldStep: Record<RegisterField, StepId> = {
  workspaceName: "about",
  fullName: "about",
  specialty: "about",
  username: "link",
  city: "link",
  serviceTitle: "service",
  servicePrice: "service",
  serviceDurationMinutes: "service",
  email: "login",
  password: "login",
};

const SHORT_PASSWORD = "Пароль короче 8 символов";

const nicheChips = ["Маникюр", "Брови и ресницы", "Стрижки", "Барбер", "Массаж"];
const durations = [30, 60, 90, 120, 180];

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes % 60 === 0) return `${minutes / 60} ч`;
  return `${String(minutes / 60).replace(".", ",")} ч`;
}

type Values = {
  workspaceName: string;
  fullName: string;
  specialty: string;
  username: string;
  serviceTitle: string;
  servicePrice: string;
  email: string;
  password: string;
};

// Те же правила, что на сервере, но с подсказками под ситуацию: пустое поле
// и опечатка объясняются по-разному.
function validate(values: Values, city: string, isSolo: boolean) {
  const errors: Partial<Record<RegisterField, string>> = {};
  const trimmed = (value: string) => value.trim();

  if (!isSolo && trimmed(values.workspaceName).length < 2) {
    errors.workspaceName = trimmed(values.workspaceName)
      ? "Название должно быть хотя бы из 2 символов"
      : "Как называется студия? Это имя увидят сотрудники";
  }
  if (trimmed(values.fullName).length < 2) {
    errors.fullName = trimmed(values.fullName)
      ? "Имя должно быть хотя бы из 2 букв"
      : "Напиши, как тебя зовут";
  }
  if (trimmed(values.specialty).length < 2) {
    errors.specialty = isSolo
      ? "Укажи нишу, по ней тебя будут искать"
      : "Укажи свою роль, например «Управляющий»";
  }
  if (values.username.length < 3) {
    errors.username = "Нужно минимум 3 символа: латиница, цифры или дефис";
  } else if (!/^[a-z0-9-]+$/.test(values.username)) {
    errors.username = "Только латинские строчные буквы, цифры и дефис";
  }
  if (!trimmed(city)) {
    errors.city = "Выбери город из списка";
  }
  if (isSolo) {
    if (trimmed(values.serviceTitle).length < 2) {
      errors.serviceTitle = "Назови услугу или нажми «Добавлю позже»";
    }
    if (!values.servicePrice) {
      errors.servicePrice = "Укажи цену в рублях";
    }
  }
  if (!trimmed(values.email)) {
    errors.email = "Укажи email, он будет логином";
  } else if (!/^\S+@\S+\.\S+$/.test(trimmed(values.email))) {
    errors.email = "Похоже, в адресе опечатка";
  }
  if (values.password.length < 8) {
    errors.password = SHORT_PASSWORD;
  }
  return errors;
}

const stepFields: Record<StepId, RegisterField[]> = {
  format: [],
  about: ["workspaceName", "fullName", "specialty"],
  link: ["username", "city"],
  service: ["serviceTitle", "servicePrice"],
  login: ["email", "password"],
};

export function RegisterForm({
  referralCode = null,
  initialAccountMode = defaultAccountMode,
  initialFullName = "",
  initialSpecialty = "",
}: {
  referralCode?: string | null;
  initialAccountMode?: AccountMode;
  initialFullName?: string;
  initialSpecialty?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    registerMasterAction,
    initialAuthActionState,
  );
  const [accountMode, setAccountMode] = useState<AccountMode>(initialAccountMode);
  const isSolo = accountMode === "solo";
  const steps: StepId[] = isSolo
    ? ["format", "about", "link", "service", "login"]
    : ["format", "about", "link", "login"];

  const [step, setStep] = useState<StepId>("format");
  const stepIndex = Math.max(steps.indexOf(step), 0);
  const isLastStep = step === "login";

  const [values, setValues] = useState<Values>({
    workspaceName: "",
    fullName: initialFullName,
    specialty: initialSpecialty,
    username: suggestUsername(initialFullName, initialSpecialty),
    serviceTitle: "",
    servicePrice: "",
    email: "",
    password: "",
  });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [city, setCity] = useState("");
  const [duration, setDuration] = useState(60);
  const [skipService, setSkipService] = useState(false);

  // Шаги, где человек уже жал «Дальше»: до этого ошибки не показываем,
  // чтобы не ругаться на поля, которые он ещё не успел заполнить.
  const [triedSteps, setTriedSteps] = useState<Set<StepId>>(() => new Set());
  // Ошибки с сервера (занятая ссылка, email уже зарегистрирован) живут, пока
  // человек не поправит поле.
  const [serverErrors, setServerErrors] = useState<
    Partial<Record<RegisterField, string>>
  >({});
  const [focusRequest, setFocusRequest] = useState(0);
  const [handledState, setHandledState] = useState(state);
  if (handledState !== state) {
    setHandledState(state);
    const incoming = state.fieldErrors ?? {};
    setServerErrors(incoming);
    const firstField = (Object.keys(fieldStep) as RegisterField[]).find(
      (field) => incoming[field],
    );
    if (firstField) {
      setStep(fieldStep[firstField]);
      setTriedSteps((current) => new Set(current).add(fieldStep[firstField]));
      // Ответ сервера с ошибками — сразу ведём к полю.
      setFocusRequest((count) => count + 1);
    }
  }

  const clientErrors = validate(values, city, isSolo);
  function fieldError(field: RegisterField) {
    if (serverErrors[field]) return serverErrors[field];
    return triedSteps.has(fieldStep[field]) ? clientErrors[field] : undefined;
  }

  function update(field: keyof Values, value: string) {
    setValues((current) => {
      const next = { ...current, [field]: value };
      if (
        !usernameEdited &&
        (field === "fullName" || field === "specialty")
      ) {
        next.username = suggestUsername(next.fullName, next.specialty);
      }
      return next;
    });
    if (serverErrors[field as RegisterField]) {
      setServerErrors((current) => {
        const next = { ...current };
        delete next[field as RegisterField];
        return next;
      });
    }
  }

  const cardRef = useRef<HTMLFormElement>(null);

  // К первому неверному полю: прокрутка по центру, фокус и вспышка рамки.
  useEffect(() => {
    if (focusRequest === 0) return;
    const target = cardRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    if (target.getAttribute("role") !== "combobox") {
      target.focus({ preventScroll: true });
    }
    target.removeAttribute("data-field-flash");
    void target.offsetWidth;
    target.setAttribute("data-field-flash", "");
  }, [focusRequest]);

  // Новый шаг: если прогресс уехал под шапку (телефон, длинный шаг),
  // возвращаем его в кадр — иначе человек видит середину нового шага.
  const wizardRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const wizard = wizardRef.current;
    if (wizard && wizard.getBoundingClientRect().top < 96) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      wizard.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }, [step]);

  function goTo(next: StepId) {
    setStep(next);
  }

  function handleNext() {
    const invalid = stepFields[step].some((field) => clientErrors[field]);
    if (invalid) {
      setTriedSteps((current) => new Set(current).add(step));
      setFocusRequest((count) => count + 1);
      return;
    }
    if (!isLastStep) {
      goTo(steps[stepIndex + 1]);
      return;
    }
    submit(skipService);
  }

  function submit(withoutService: boolean) {
    const formData = new FormData();
    formData.set("accountMode", accountMode);
    formData.set("workspaceName", values.workspaceName);
    formData.set("fullName", values.fullName);
    formData.set("specialty", values.specialty);
    formData.set("username", values.username);
    formData.set("city", city);
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("serviceTitle", withoutService ? "" : values.serviceTitle);
    formData.set("servicePrice", withoutService ? "" : values.servicePrice);
    formData.set("serviceDurationMinutes", String(duration));
    formData.set("serviceDescription", "");
    if (isSolo && withoutService) formData.set("skipService", "1");
    if (referralCode) formData.set("referralCode", referralCode);
    startTransition(() => formAction(formData));
  }

  if (state.success && state.redirectTo) {
    return (
      <DoneScreen
        firstName={values.fullName.trim().split(/\s+/)[0] ?? ""}
        username={state.publicUsername ?? values.username}
        isSolo={isSolo}
        redirectTo={state.redirectTo}
        confirmEmail={state.confirmEmail}
      />
    );
  }

  return (
    <div ref={wizardRef} className="flex scroll-mt-28 flex-col gap-5">
      <div className="flex flex-col gap-3 px-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            Шаг {stepIndex + 1} из {steps.length}
          </p>
          <p className="text-[13px] text-muted">{stepNames[step]}</p>
        </div>
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-label="Прогресс регистрации"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
        >
          {steps.map((id, index) => (
            <div
              key={id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                index <= stepIndex ? "bg-ink" : "bg-panel-strong",
              )}
            />
          ))}
        </div>
      </div>

      <form
        ref={cardRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          handleNext();
        }}
        className="flex flex-col gap-6 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8"
      >
        {step === "format" ? (
          <StepBody
            title="Как ты будешь работать?"
            lead="От этого зависит, каким будет твой кабинет."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                active={isSolo}
                onClick={() => setAccountMode("solo")}
                icon={<User size={24} strokeWidth={1.6} aria-hidden />}
                title="Одиночный мастер"
                description="Свой кабинет, услуги и личная ссылка для записи."
              />
              <ModeCard
                active={!isSolo}
                onClick={() => setAccountMode("studio")}
                icon={<Users size={24} strokeWidth={1.6} aria-hidden />}
                title="Студия"
                description="Салон, барбершоп или сеть: команда мастеров и админка."
              />
            </div>
            <Tip icon={<Lightbulb size={20} strokeWidth={1.6} aria-hidden />}>
              Работаешь без команды? Выбирай «Одиночный мастер».
            </Tip>
          </StepBody>
        ) : null}

        {step === "about" ? (
          <StepBody
            title="Давай знакомиться"
            lead={
              isSolo
                ? "Имя и ниша появятся на твоей странице записи."
                : "Название студии и твоё имя увидят сотрудники."
            }
          >
            {!isSolo ? (
              <Input
                label="Название студии"
                name="workspaceName"
                placeholder="okno studio"
                value={values.workspaceName}
                onChange={(event) => update("workspaceName", event.target.value)}
                error={fieldError("workspaceName")}
              />
            ) : null}
            <Input
              label="Как тебя зовут"
              name="fullName"
              autoComplete="name"
              placeholder={isSolo ? "Алина" : "Алина Мороз"}
              value={values.fullName}
              onChange={(event) => update("fullName", event.target.value)}
              error={fieldError("fullName")}
            />
            <div className="flex flex-col gap-3">
              <Input
                label={isSolo ? "Чем занимаешься" : "Твоя роль"}
                name="specialty"
                placeholder={isSolo ? "Маникюр и брови" : "Управляющий студией"}
                value={values.specialty}
                onChange={(event) => update("specialty", event.target.value)}
                error={fieldError("specialty")}
              />
              {isSolo ? (
                <div className="flex flex-wrap gap-2">
                  {nicheChips.map((chip) => (
                    <Chip
                      key={chip}
                      active={values.specialty === chip}
                      onClick={() => update("specialty", chip)}
                    >
                      {chip}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
            {isSolo ? (
              <Tip icon={<Search size={20} strokeWidth={1.6} aria-hidden />}>
                По нише тебя находят в поиске. Пиши полными словами, как ищут
                клиенты: «маникюр и брови».
              </Tip>
            ) : null}
          </StepBody>
        ) : null}

        {step === "link" ? (
          <StepBody
            title={isSolo ? "Твоя ссылка для записи" : "Логин и город"}
            lead={
              isSolo
                ? "По ней клиенты выбирают услугу и время."
                : "Username нужен для входа и личного кабинета администратора."
            }
          >
            <AffixField
              id="register-username"
              label={isSolo ? "Публичная ссылка" : "Username администратора"}
              prefix={isSolo ? `${publicLinkHost}/` : undefined}
              error={fieldError("username")}
              hint={
                usernameEdited
                  ? "Латинские строчные буквы, цифры и дефис."
                  : "Собрали из имени и ниши. Можно заменить на свою."
              }
              inputProps={{
                name: "username",
                autoComplete: "off",
                spellCheck: false,
                autoCapitalize: "none",
                placeholder: isSolo ? "alina-manikyur" : "alina-admin",
                value: values.username,
                onChange: (event) => {
                  setUsernameEdited(true);
                  update(
                    "username",
                    event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  );
                },
                className: "font-medium",
              }}
            />
            <CityPickerField
              value={city}
              onChange={setCity}
              error={fieldError("city")}
            />
            {isSolo ? (
              <Tip icon={<Link2 size={20} strokeWidth={1.6} aria-hidden />}>
                Ссылку ставят в шапку профиля и отправляют клиентам. Короткую
                легче запомнить.
              </Tip>
            ) : null}
          </StepBody>
        ) : null}

        {step === "service" ? (
          <StepBody
            title="Первая услуга"
            lead="Одной достаточно, чтобы клиенты уже могли записаться."
          >
            <Input
              label="Название"
              name="serviceTitle"
              placeholder="Маникюр с покрытием"
              value={values.serviceTitle}
              onChange={(event) => update("serviceTitle", event.target.value)}
              error={fieldError("serviceTitle")}
            />
            <AffixField
              id="register-price"
              label="Цена"
              suffix="₽"
              className="max-w-[220px]"
              error={fieldError("servicePrice")}
              inputProps={{
                name: "servicePrice",
                inputMode: "numeric",
                placeholder: "1900",
                value: values.servicePrice,
                onChange: (event) =>
                  update("servicePrice", event.target.value.replace(/[^0-9]/g, "")),
              }}
            />
            <div className="flex flex-col gap-2">
              <p id="register-duration" className="text-sm font-medium text-ink">
                Сколько длится
              </p>
              <div
                role="group"
                aria-labelledby="register-duration"
                className="flex flex-wrap gap-2"
              >
                {durations.map((minutes) => (
                  <Chip
                    key={minutes}
                    active={duration === minutes}
                    solid
                    onClick={() => setDuration(minutes)}
                  >
                    {durationLabel(minutes)}
                  </Chip>
                ))}
              </div>
            </div>
            <Tip icon={<Lightbulb size={20} strokeWidth={1.6} aria-hidden />}>
              Начни с самой популярной. Описание и остальные услуги добавишь в
              кабинете.
            </Tip>
          </StepBody>
        ) : null}

        {step === "login" ? (
          <StepBody
            title="Последний шаг: вход"
            lead="С этими данными ты будешь заходить в кабинет."
          >
            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              error={fieldError("email")}
            />
            <PasswordField
              value={values.password}
              onChange={(value) => update("password", value)}
              error={fieldError("password")}
            />
            {/* Оферта считает акцептом завершение регистрации, а п. 3.6
                требует ознакомления с Правилами и Согласием — ссылки на все
                документы должны стоять прямо у кнопки. */}
            <p className="text-xs leading-[1.6] text-muted">
              Создавая аккаунт, вы принимаете{" "}
              <LegalLink href="/legal/offer">публичную оферту</LegalLink>,{" "}
              <LegalLink href="/legal/rules">правила использования сервиса</LegalLink>{" "}
              и{" "}
              <LegalLink href="/legal/consent">
                согласие на обработку персональных данных
              </LegalLink>
              , а также подтверждаете, что ознакомились с{" "}
              <LegalLink href="/legal/privacy">
                политикой обработки персональных данных
              </LegalLink>
              .
            </p>
          </StepBody>
        ) : null}

        {!state.success && state.message && !state.fieldErrors ? (
          <FormMessage message={state.message} />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={() => goTo(steps[stepIndex - 1])}
                className="min-h-11 rounded-full px-4 text-sm font-medium text-ink transition hover:bg-panel"
              >
                Назад
              </button>
            ) : null}
            {step === "service" ? (
              <button
                type="button"
                onClick={() => {
                  setSkipService(true);
                  setTriedSteps((current) => {
                    const next = new Set(current);
                    next.delete("service");
                    return next;
                  });
                  goTo("login");
                }}
                className="min-h-11 rounded-full px-4 text-sm font-medium text-muted transition hover:bg-panel hover:text-ink"
              >
                Добавлю позже
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={isPending}
            onClick={() => {
              if (step === "service") setSkipService(false);
            }}
            style={{
              backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
              color: "var(--ui-primary-text)",
            }}
            className="ml-auto inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[15px] font-medium transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLastStep
              ? isPending
                ? "Создаю аккаунт…"
                : "Создать аккаунт"
              : "Дальше"}
          </button>
        </div>
      </form>

      <p className="mt-1 text-center text-sm text-muted">
        Уже есть аккаунт?{" "}
        <Link
          href="/login"
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          Войти
        </Link>
      </p>
    </div>
  );
}

function StepBody({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        <p className="text-[15px] leading-normal text-ink-soft">{lead}</p>
      </div>
      {children}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-2 rounded-nested border p-4 text-left text-ink transition",
        active ? "border-ink bg-panel" : "border-line bg-surface hover:border-ink-soft",
      )}
    >
      {icon}
      <span className="text-base font-semibold">{title}</span>
      <span className="text-sm leading-normal text-ink-soft">{description}</span>
    </button>
  );
}

function Tip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-panel bg-accent-soft px-4 py-3 text-accent-deep">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-sm leading-normal">{children}</p>
    </div>
  );
}

function Chip({
  active,
  solid = false,
  onClick,
  children,
}: {
  active: boolean;
  solid?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm transition",
        solid && "font-medium",
        active
          ? solid
            ? "border-ink bg-ink text-ink-contrast"
            : "border-ink bg-panel text-ink"
          : solid
            ? "border-line bg-surface text-ink hover:border-ink-soft"
            : "border-line bg-background text-ink-soft hover:border-ink-soft",
      )}
    >
      {children}
    </button>
  );
}

// Поле с неизменяемой частью слева или справа: «okno.business/» или «₽».
function AffixField({
  id,
  label,
  prefix,
  suffix,
  hint,
  error,
  className,
  inputProps,
}: {
  id: string;
  label: string;
  prefix?: string;
  suffix?: string;
  hint?: string;
  error?: string;
  className?: string;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const note = error || hint;
  const { className: inputClassName, ...restInput } = inputProps;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label htmlFor={id} className="font-medium text-ink">
        {label}
      </label>
      <div
        data-ui-affix
        data-invalid={error ? true : undefined}
        style={{
          borderColor: error ? "var(--color-danger)" : "var(--color-line)",
          backgroundColor: error ? "var(--color-danger-soft)" : "var(--ui-field-bg)",
        }}
        className={cn(
          "flex min-h-12 items-center rounded-field border px-4 transition",
          suffix && "gap-2",
          className,
        )}
      >
        {prefix ? (
          <span className="whitespace-nowrap text-[15px] text-muted">{prefix}</span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          className={cn(
            "min-h-11 min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-ink outline-none",
            inputClassName,
          )}
          {...restInput}
        />
        {suffix ? <span className="text-[15px] text-muted">{suffix}</span> : null}
      </div>
      {note ? (
        <span
          id={`${id}-note`}
          role={error ? "alert" : undefined}
          className="text-xs leading-normal"
          style={{ color: error ? "var(--color-danger)" : "var(--color-muted)" }}
        >
          {note}
        </span>
      ) : null}
    </div>
  );
}

function CityPickerField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <CityPicker
      label="Город"
      name="city"
      defaultValue={value || undefined}
      onValueChange={onChange}
      error={error}
      hint="Часовой пояс определим сами. Точный адрес добавишь в кабинете."
    />
  );
}

function PasswordField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const longEnough = value.length >= 8;
  // Короткий пароль подсказка гасит сама, как только длины хватает. Отказ
  // сервера («слишком простой») держим, пока пароль не поменяют.
  const shownError = error && (!longEnough || error !== SHORT_PASSWORD) ? error : undefined;
  const color = shownError
    ? "var(--color-danger)"
    : longEnough
      ? "var(--color-success)"
      : "var(--color-muted)";
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-ink">Пароль</span>
      <input
        type="password"
        name="password"
        autoComplete="new-password"
        placeholder="Придумай пароль"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={shownError ? true : undefined}
        aria-describedby="register-password-note"
        data-ui-input
        style={{
          borderColor: shownError ? "var(--color-danger)" : "var(--color-line)",
          backgroundColor: shownError ? "var(--color-danger-soft)" : "var(--ui-field-bg)",
          color: "var(--color-ink)",
        }}
        className="min-h-12 rounded-field border px-4 text-[15px] outline-none transition"
      />
      <span
        id="register-password-note"
        role={shownError ? "alert" : undefined}
        className="flex items-center gap-2 text-xs"
        style={{ color }}
      >
        <CircleCheck size={16} aria-hidden />
        {shownError ?? (longEnough ? "Отлично, длины хватает" : "Минимум 8 символов")}
      </span>
    </label>
  );
}

function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="underline underline-offset-4 transition hover:text-ink"
    >
      {children}
    </Link>
  );
}

function DoneScreen({
  firstName,
  username,
  isSolo,
  redirectTo,
  confirmEmail,
}: {
  firstName: string;
  username: string;
  isSolo: boolean;
  redirectTo: string;
  confirmEmail?: string;
}) {
  const [copied, setCopied] = useState(false);
  const link = `${publicLinkHost}/${username}`;

  // Экран короче мастера регистрации — без прокрутки вверх он открывается
  // внизу страницы, на подвале.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  // Почта ещё не подтверждена: в кабинет пустим после перехода по ссылке.
  if (confirmEmail) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-card border border-line bg-surface px-5 py-8 text-center shadow-card sm:px-8">
        <div className="flex size-16 items-center justify-center rounded-full bg-accent text-ink">
          <Mail size={28} strokeWidth={1.8} aria-hidden />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-ink">
            Проверь почту{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-[15px] leading-normal text-ink-soft">
            Отправили письмо на <span className="font-medium text-ink">{confirmEmail}</span>. Нажми в нём
            «Подтвердить почту» — и входи в {isSolo ? "кабинет" : "админку"}. Письма нет пару минут — загляни в «Спам».
          </p>
        </div>
        <div className="w-full max-w-sm">
          <ResendConfirmationForm email={confirmEmail} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-card border border-line bg-surface px-5 py-8 text-center shadow-card sm:px-8">
      <div className="flex size-16 items-center justify-center rounded-full bg-accent text-ink">
        <Check size={28} strokeWidth={2} aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-ink">
          Готово{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-[15px] leading-normal text-ink-soft">
          {isSolo
            ? "Страница записи уже работает. Отправь ссылку первому клиенту."
            : "Админка готова. Добавь мастеров — и у каждого появится своя ссылка."}
        </p>
      </div>
      {isSolo ? (
        <div className="flex max-w-full items-center gap-3 rounded-panel bg-panel px-4 py-3 text-ink">
          <Link2 size={20} strokeWidth={1.6} className="shrink-0" aria-hidden />
          <p className="truncate text-[15px] font-medium">{link}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <a
          href={redirectTo}
          style={{
            backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
            color: "var(--ui-primary-text)",
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition hover:-translate-y-0.5"
        >
          {isSolo ? "Перейти в кабинет" : "Открыть админку"}
        </a>
        {isSolo ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(`https://${link}`)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition hover:border-ink-soft"
          >
            {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
