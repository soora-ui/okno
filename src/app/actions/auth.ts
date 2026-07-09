"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getCityLabel,
  resolveTimezoneForCity,
} from "@/lib/cities";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseMissingColumnError } from "@/lib/supabase/auth-errors";
import {
  isAccountActive,
  normalizeAccountRole,
  normalizeWorkspaceKind,
  normalizeAccountStatus,
  getDefaultAccountRoute,
  workspaceKindValues,
} from "@/lib/workspace";

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

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: "Проверь форму: имя, email, пароль, username, город и параметры услуги.",
      values: echoValues,
    };
  }

  const isSoloAccount = parsed.data.accountMode === "solo";
  const workspaceName = isSoloAccount
    ? parsed.data.fullName
    : parsed.data.workspaceName.trim();

  if (!isSoloAccount && workspaceName.length < 2) {
    return {
      success: false,
      message: "Для студии или компании укажи название команды.",
      values: echoValues,
    };
  }

  if (
    isSoloAccount &&
    (!parsed.data.serviceTitle ||
      parsed.data.serviceTitle.length < 2 ||
      parsed.data.servicePrice < 0 ||
      parsed.data.serviceDurationMinutes < 15)
  ) {
    return {
      success: false,
      message: "Для одиночного мастера заполни первую услугу: название, цену и длительность.",
      values: echoValues,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", parsed.data.username)
    .maybeSingle();

  if (existingProfile) {
    return {
      success: false,
      message: "Этот username уже занят.",
      values: echoValues,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      success: false,
      message: error?.message || "Не получилось создать аккаунт.",
      values: echoValues,
    };
  }

  const workspaceId = randomUUID();
  const accountRole = isSoloAccount ? "solo" : "admin";
  const timezone = resolveTimezoneForCity(parsed.data.city);
  const locationText = getCityLabel(parsed.data.city);
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
  };

  let { error: profileError } = await admin.from("profiles").insert(profileInsert);

  if (profileError && isSupabaseMissingColumnError(profileError, "account_status")) {
    const { account_status: _accountStatus, ...legacyInsert } = profileInsert;
    void _accountStatus;

    const retryResult = await admin.from("profiles").insert(legacyInsert);
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

  if (profileRow && isSoloAccount) {
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

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/team");
  redirect(isSoloAccount ? "/dashboard" : "/team");
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
