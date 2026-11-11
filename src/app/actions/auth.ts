"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isConfirmLinkType } from "@/lib/auth/email-hook";
import {
  getCityLabel,
  resolveTimezoneForCity,
} from "@/lib/cities";
import { env, isSupabaseConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isSupabaseMissingColumnError,
  isSupabaseMissingTableError,
} from "@/lib/supabase/auth-errors";
import { generateReferralCode, normalizeReferralCode } from "@/lib/referral";
import { RESERVED_USERNAME_MESSAGE, isReservedUsername } from "@/lib/reserved-usernames";
import {
  isAccountActive,
  normalizeAccountRole,
  normalizeWorkspaceKind,
  normalizeAccountStatus,
  getDefaultAccountRoute,
  workspaceKindValues,
} from "@/lib/workspace";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Генерируем код и проверяем уникальность в базе. Коллизии у 7-символьного
// кода из 32-буквенного алфавита практически невозможны, но перепроверка
// дешёвая, а сюрпризов от гонки регистраций не будет.
async function generateUniqueReferralCode(
  admin: SupabaseAdminClient,
): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateReferralCode();
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", candidate)
      .maybeSingle();

    if (error) {
      if (isSupabaseMissingColumnError(error, "referral_code")) {
        return null;
      }
      continue;
    }

    if (!data) {
      return candidate;
    }
  }

  return null;
}

// Ищем пригласившего по коду из ?ref=CODE. Если код не найден или таблица ещё
// не смигрирована — просто регистрируем без реферала, не блокируя регистрацию.
async function resolveReferrerProfileId(
  admin: SupabaseAdminClient,
  referralCodeRaw: string | undefined,
): Promise<string | null> {
  const referralCode = normalizeReferralCode(referralCodeRaw);
  if (!referralCode) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("referral_code", referralCode)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return String(data.id);
}

export type RegisterFormValues = {
  accountMode: string;
  workspaceName: string;
  fullName: string;
  specialty: string;
  email: string;
  username: string;
  city: string;
  serviceTitle: string;
  servicePrice: string;
  serviceDurationMinutes: string;
  serviceDescription: string;
};

export type AuthActionState = {
  success: boolean;
  message: string;
  // Введённые значения возвращаются обратно в форму: в React 19
  // <form action> сбрасывает неконтролируемые поля после сабмита, поэтому
  // без эха данные мастера терялись бы при ошибке валидации.
  values?: RegisterFormValues;
  // Ошибки по конкретным полям: форма подсвечивает поле, пишет подсказку
  // под ним и прокручивает к первому неверному.
  fieldErrors?: Partial<Record<RegisterField, string>>;
  // Успешная регистрация: форма показывает экран «Готово» с публичной
  // ссылкой и кнопкой в кабинет, а не перекидывает сразу.
  redirectTo?: string;
  publicUsername?: string;
  // Почта ждёт подтверждения по ссылке из письма: без него в кабинет не
  // пускаем. Форма показывает адрес и кнопку «Отправить письмо ещё раз».
  confirmEmail?: string;
};

export type RegisterField =
  | "workspaceName"
  | "fullName"
  | "specialty"
  | "email"
  | "password"
  | "username"
  | "city"
  | "serviceTitle"
  | "servicePrice"
  | "serviceDurationMinutes";

const registerFieldMessages: Record<RegisterField, string> = {
  workspaceName: "Укажи название студии или компании — хотя бы 2 символа.",
  fullName: "Напиши имя — хотя бы 2 буквы.",
  specialty: "Укажи нишу — хотя бы 2 буквы, например «Маникюр».",
  email: "Похоже, в email опечатка. Пример: you@example.com",
  password: "Пароль должен быть не короче 8 символов.",
  username:
    "Только латинские строчные буквы, цифры и дефис, от 3 символов. Пример: alina-nails",
  city: "Выбери город из списка.",
  serviceTitle: "Напиши название услуги — хотя бы 2 буквы.",
  servicePrice: "Укажи цену числом, например 1900.",
  serviceDurationMinutes: "Длительность — число минут, не меньше 15.",
};

const registerSchema = z.object({
  accountMode: z.enum(workspaceKindValues),
  workspaceName: z.string().trim().optional().default(""),
  fullName: z.string().trim().min(2),
  specialty: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().trim().min(3).regex(/^[a-z0-9-]+$/),
  serviceTitle: z.string().trim().optional().default(""),
  servicePrice: z.coerce.number().optional().default(0),
  serviceDurationMinutes: z.coerce.number().optional().default(60),
  city: z.string().trim().min(2),
  serviceDescription: z.string().trim().optional().default(""),
  referralCode: z.string().trim().optional().default(""),
  // «Добавлю позже» на шаге услуги: аккаунт создаётся без первой услуги.
  skipService: z.string().optional().default(""),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  redirectTo: z.string().optional(),
});

export async function registerMasterAction(
  _prevState: AuthActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message:
        "Supabase еще не подключен. Добавь ключи в .env.local, и регистрация станет реальной.",
    };
  }

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const echoValues: RegisterFormValues = {
    accountMode: raw.accountMode ?? "solo",
    workspaceName: raw.workspaceName ?? "",
    fullName: raw.fullName ?? "",
    specialty: raw.specialty ?? "",
    email: raw.email ?? "",
    username: raw.username ?? "",
    city: raw.city ?? "",
    serviceTitle: raw.serviceTitle ?? "",
    servicePrice: raw.servicePrice ?? "",
    serviceDurationMinutes: raw.serviceDurationMinutes ?? "",
    serviceDescription: raw.serviceDescription ?? "",
  };

  const fieldErrors: Partial<Record<RegisterField, string>> = {};
  const isSoloMode = (raw.accountMode ?? "solo") === "solo";
  const skipService = raw.skipService === "1";

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && field in registerFieldMessages) {
        fieldErrors[field as RegisterField] ??=
          registerFieldMessages[field as RegisterField];
      }
    }
  }

  // Доп. проверки делаем и при провале схемы, чтобы человек увидел все
  // неверные поля сразу, а не по одному за отправку.
  if (!isSoloMode && (raw.workspaceName ?? "").trim().length < 2) {
    fieldErrors.workspaceName = registerFieldMessages.workspaceName;
  }

  if (isSoloMode && !skipService) {
    const price = Number(raw.servicePrice);
    const duration = Number(raw.serviceDurationMinutes);
    if ((raw.serviceTitle ?? "").trim().length < 2) {
      fieldErrors.serviceTitle = registerFieldMessages.serviceTitle;
    }
    if (!raw.servicePrice?.trim() || !Number.isFinite(price) || price < 0) {
      fieldErrors.servicePrice = registerFieldMessages.servicePrice;
    }
    if (!Number.isFinite(duration) || duration < 15) {
      fieldErrors.serviceDurationMinutes =
        registerFieldMessages.serviceDurationMinutes;
    }
  }

  const username = (raw.username ?? "").trim();
  if (!fieldErrors.username && username && isReservedUsername(username)) {
    fieldErrors.username = RESERVED_USERNAME_MESSAGE;
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      message: "Проверь отмеченные поля — подсказки под ними.",
      values: echoValues,
      fieldErrors,
    };
  }

  const isSoloAccount = parsed.data.accountMode === "solo";
  const workspaceName = isSoloAccount
    ? parsed.data.fullName
    : parsed.data.workspaceName.trim();

  const admin = createSupabaseAdminClient();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", parsed.data.username)
    .maybeSingle();

  if (existingProfile) {
    return {
      success: false,
      message: "Проверь отмеченные поля — подсказки под ними.",
      values: echoValues,
      fieldErrors: {
        username: "Эта ссылка уже занята — добавь к ней город или цифру.",
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // Имя нужно письму подтверждения: «Анна, остался один шаг».
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error || !data.user) {
    const errorText = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
    if (/already|exists|registered/.test(errorText)) {
      return {
        success: false,
        message: "Проверь отмеченные поля — подсказки под ними.",
        values: echoValues,
        fieldErrors: {
          email: "С этим email уже есть аккаунт — войди или укажи другой.",
        },
      };
    }
    if (/weak_password|password/.test(errorText)) {
      return {
        success: false,
        message: "Проверь отмеченные поля — подсказки под ними.",
        values: echoValues,
        fieldErrors: {
          password: "Пароль слишком простой — добавь цифры или буквы другого регистра.",
        },
      };
    }
    // Письмо подтверждения не ушло (хук /api/auth/send-email ответил
    // ошибкой) — GoTrue тогда пользователя не создаёт, можно просто повторить.
    if (/sending|hook|over_email_send_rate_limit/.test(errorText)) {
      return {
        success: false,
        message: "Не получилось отправить письмо для подтверждения почты. Попробуй ещё раз через минуту.",
        values: echoValues,
      };
    }
    if (/email/.test(errorText)) {
      return {
        success: false,
        message: "Проверь отмеченные поля — подсказки под ними.",
        values: echoValues,
        fieldErrors: { email: registerFieldMessages.email },
      };
    }
    return {
      success: false,
      message: error?.message || "Не получилось создать аккаунт.",
      values: echoValues,
    };
  }

  // При включённом подтверждении почты GoTrue не говорит, что адрес занят
  // (защита от перебора адресов): возвращает подставного пользователя без
  // identities. Профиль на такой id создавать нельзя — аккаунта за ним нет.
  if (data.user.identities?.length === 0) {
    return {
      success: false,
      message: "Проверь отмеченные поля — подсказки под ними.",
      values: echoValues,
      fieldErrors: {
        email: "С этим email уже есть аккаунт — войди или укажи другой.",
      },
    };
  }

  // Повторная регистрация до подтверждения: GoTrue отдаёт того же
  // пользователя и шлёт письмо заново. Профиль уже есть — второй не
  // создаём, а откат ниже удалил бы и первую регистрацию.
  const { data: profileForUser } = await admin
    .from("profiles")
    .select("id")
    .eq("password_auth_id", data.user.id)
    .maybeSingle();

  if (profileForUser) {
    return {
      success: false,
      message: `Аккаунт с этим email уже создан. Мы снова отправили письмо на ${parsed.data.email} — подтверди почту и войди.`,
      values: echoValues,
      confirmEmail: parsed.data.email,
    };
  }

  const workspaceId = randomUUID();
  const accountRole = isSoloAccount ? "solo" : "admin";
  const timezone = resolveTimezoneForCity(parsed.data.city);
  const locationText = getCityLabel(parsed.data.city);
  const referralCode = await generateUniqueReferralCode(admin);
  const referredByProfileId = await resolveReferrerProfileId(
    admin,
    parsed.data.referralCode,
  );
  const profileInsert = {
    email: parsed.data.email,
    password_auth_id: data.user.id,
    full_name: parsed.data.fullName,
    username: parsed.data.username,
    specialty: parsed.data.specialty,
    timezone,
    bio: "",
    location_text: locationText,
    workspace_id: workspaceId,
    workspace_name: workspaceName,
    workspace_kind: parsed.data.accountMode,
    account_role: accountRole,
    account_status: "active",
    created_by_profile_id: null,
    referral_code: referralCode,
    referred_by: referredByProfileId,
  };

  let { error: profileError } = await admin.from("profiles").insert(profileInsert);

  if (profileError && isSupabaseMissingColumnError(profileError, "account_status")) {
    const { account_status: _accountStatus, ...legacyInsert } = profileInsert;
    void _accountStatus;

    const retryResult = await admin.from("profiles").insert(legacyInsert);
    profileError = retryResult.error;
  }

  if (
    profileError &&
    (isSupabaseMissingColumnError(profileError, "referral_code") ||
      isSupabaseMissingColumnError(profileError, "referred_by"))
  ) {
    const {
      referral_code: _referralCode,
      referred_by: _referredBy,
      ...withoutReferral
    } = profileInsert;
    void _referralCode;
    void _referredBy;

    const retryResult = await admin.from("profiles").insert(withoutReferral);
    profileError = retryResult.error;
  }

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return {
      success: false,
      message: "Аккаунт создался, но профиль мастера не записался в базу.",
      values: echoValues,
    };
  }

  const { data: profileRow } = await admin
    .from("profiles")
    .select("id")
    .eq("password_auth_id", data.user.id)
    .single();

  if (profileRow && isSoloAccount && parsed.data.skipService !== "1") {
    await admin.from("services").insert({
      profile_id: profileRow.id,
      title: parsed.data.serviceTitle,
      description: parsed.data.serviceDescription,
      duration_minutes: parsed.data.serviceDurationMinutes || 60,
      price: parsed.data.servicePrice || 0,
      sort_order: 1,
      is_active: true,
    });
  }

  // Заводим pending-запись о реферале сразу при регистрации — бонус
  // применится позже, вебхуком ЮKassa, при первой успешной оплате PRO.
  // Ошибку не считаем фатальной для регистрации: в худшем случае просто не
  // будет строчки в истории приглашений у пригласившего.
  if (profileRow && referredByProfileId) {
    const { error: referralInsertError } = await admin
      .from("referral_rewards")
      .insert({
        referrer_profile_id: referredByProfileId,
        referred_profile_id: profileRow.id,
        status: "pending",
      });

    if (
      referralInsertError &&
      !isSupabaseMissingTableError(referralInsertError, "referral_rewards")
    ) {
      logError("Failed to record referral reward on registration", {
        referrerProfileId: referredByProfileId,
        referredProfileId: profileRow.id,
        error: referralInsertError,
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/team");
  return {
    success: true,
    message: "",
    redirectTo: isSoloAccount ? "/dashboard" : "/team",
    publicUsername: parsed.data.username,
    // Сессии нет, пока почта не подтверждена: экран «Готово» просит открыть
    // письмо, а не ведёт в кабинет.
    confirmEmail: data.session ? undefined : parsed.data.email,
  };
}

export async function loginMasterAction(
  _prevState: AuthActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message:
        "Supabase еще не подключен. Добавь ключи в .env.local, и вход станет реальным.",
    };
  }

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Проверь email и пароль." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error?.code === "email_not_confirmed") {
    return {
      success: false,
      message: `Почта ${parsed.data.email} ещё не подтверждена. Открой письмо от okno и нажми «Подтвердить почту».`,
      confirmEmail: parsed.data.email,
    };
  }

  if (error || !data.user) {
    return {
      success: false,
      message: "Не получилось войти. Проверь email и пароль.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/team");
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("password_auth_id", data.user.id)
    .maybeSingle();

  if (!isAccountActive(normalizeAccountStatus(profileRow?.account_status))) {
    await supabase.auth.signOut();
    return {
      success: false,
      message:
        "Этот кабинет отключен администратором. Обратись к нему, чтобы вернуть доступ.",
    };
  }

  // Разрешаем только внутренние пути: "//evil.com" и "/\evil.com" браузер
  // трактует как переход на внешний домен (open redirect).
  const requestedRedirect = parsed.data.redirectTo;
  const isSafeRedirect =
    requestedRedirect &&
    requestedRedirect.startsWith("/") &&
    !requestedRedirect.startsWith("//") &&
    !requestedRedirect.startsWith("/\\");
  const redirectTo = isSafeRedirect
    ? requestedRedirect
    : getDefaultAccountRoute({
          accountRole: normalizeAccountRole(profileRow?.account_role),
          workspaceKind: normalizeWorkspaceKind(profileRow?.workspace_kind),
        });
  redirect(redirectTo);
}

export async function signOutAction() {
  if (!isSupabaseConfigured) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Подтверждение паролем для сессии, открытой из мини-аппа Telegram
// (src/lib/auth/session-origin.ts). Успешный вход по паролю заменяет сессию
// на парольную — ограничение на действия с деньгами снимается само.
export async function confirmPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Для подтверждения нужно подключение к Supabase." };
  }

  const password = String(formData.get("password") ?? "");
  if (!password) {
    return { success: false, message: "Введи пароль от кабинета." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { success: false, message: "Сессия истекла. Открой кабинет заново." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (error) {
    return { success: false, message: "Пароль не подошёл. Попробуй ещё раз." };
  }

  revalidatePath("/settings");
  return { success: true, message: "Пароль подтверждён — все разделы доступны." };
}

const emailOnlySchema = z.object({ email: z.string().trim().email() });

function isEmailRateLimited(error: { code?: string; status?: number } | null) {
  return error?.code === "over_email_send_rate_limit" || error?.status === 429;
}

export async function resendConfirmationAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!isSupabaseConfigured || !parsed.success) {
    return { success: false, message: "Не получилось отправить письмо. Проверь email." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data.email });

  if (isEmailRateLimited(error)) {
    return {
      success: false,
      message: "Письмо уже ушло совсем недавно. Подожди минуту и попробуй снова — и загляни в «Спам».",
    };
  }

  if (error) {
    logError("Failed to resend signup confirmation", { error });
    return { success: false, message: "Не получилось отправить письмо. Попробуй через минуту." };
  }

  return {
    success: true,
    message: `Отправили письмо на ${parsed.data.email}. Если его нет — проверь «Спам».`,
  };
}

export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { success: false, message: "Похоже, в email опечатка. Пример: you@example.com" };
  }

  if (!isSupabaseConfigured) {
    return { success: false, message: "Сброс пароля недоступен без подключения к Supabase." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);

  if (isEmailRateLimited(error)) {
    return {
      success: false,
      message: "Письмо уже ушло совсем недавно. Подожди минуту и попробуй снова.",
    };
  }

  if (error) {
    logError("Failed to request password reset", { error });
  }

  // Одинаковый ответ, есть аккаунт или нет: иначе форму можно использовать
  // для проверки, чьи адреса зарегистрированы.
  return {
    success: true,
    message: `Если аккаунт с адресом ${parsed.data.email} есть, письмо со ссылкой уже в пути. Проверь и «Спам».`,
  };
}

// Подтверждение ссылки из письма. Ссылка открывает страницу /auth/confirm с
// кнопкой, а токен тратится только по нажатию: почтовые сканеры (Outlook,
// Mail.ru) заранее открывают ссылки из писем и сожгли бы его сами.
export async function confirmEmailLinkAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = formData.get("type");

  if (!isSupabaseConfigured || !tokenHash || !isConfirmLinkType(type)) {
    return { success: false, message: "Ссылка неполная. Открой её из письма ещё раз." };
  }

  const expiredMessage =
    type === "recovery"
      ? "Ссылка устарела или уже использована. Запроси сброс пароля заново."
      : "Ссылка устарела или уже использована. Попробуй войти — если почта не подтверждена, мы предложим отправить письмо ещё раз.";

  if (type === "recovery") {
    // Сброс пароля: нужна сессия, чтобы задать новый пароль.
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error) {
      return { success: false, message: expiredMessage };
    }
    redirect("/reset-password");
  }

  // Подтверждение почты сессию не открывает: вход по ссылке помечается в
  // токене как беспарольный (как вход из Telegram, см. session-origin.ts), и
  // действия с деньгами были бы закрыты. Проверяем токен без cookies, а
  // войти мастер входит паролем.
  const verifier = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await verifier.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return { success: false, message: expiredMessage };
  }

  if (type === "email_change") {
    return {
      success: true,
      message:
        "Готово, адрес подтверждён. Если письмо приходило и на прежнюю почту — подтверди и его, тогда адрес для входа сменится.",
    };
  }

  redirect("/login?reason=confirmed");
}

const newPasswordSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword);

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "Пароль — не короче 8 символов, и оба поля должны совпадать.",
    };
  }

  if (!isSupabaseConfigured) {
    return { success: false, message: "Смена пароля недоступна без подключения к Supabase." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      success: false,
      message: "Ссылка из письма устарела. Запроси сброс пароля ещё раз.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
    return {
      success: false,
      message: /same_password|different from the old/.test(text)
        ? "Новый пароль совпадает со старым — придумай другой."
        : /weak/.test(text)
          ? "Пароль слишком простой — добавь цифры или буквы другого регистра."
          : "Не получилось сменить пароль. Запроси ссылку ещё раз.",
    };
  }

  // Сессия из ссылки сброса беспарольная — входим новым паролем, чтобы
  // действия с деньгами не требовали подтверждения (session-origin.ts).
  await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.password });

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("account_role, workspace_kind")
    .eq("password_auth_id", user.id)
    .maybeSingle();

  revalidatePath("/dashboard");
  redirect(
    getDefaultAccountRoute({
      accountRole: normalizeAccountRole(profileRow?.account_role),
      workspaceKind: normalizeWorkspaceKind(profileRow?.workspace_kind),
    }),
  );
}
