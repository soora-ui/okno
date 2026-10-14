"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCityLabel,
  resolveTimezoneForCity,
} from "@/lib/cities";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingColumnError } from "@/lib/supabase/auth-errors";
import {
  accountStatusValues,
  canManageWorkspace,
  isTeamWorkspaceKind,
} from "@/lib/workspace";
import { hasCapability, resolveSubscription } from "@/lib/subscription";
import { loadSeatBalance } from "@/lib/subscription-seats";
import { RESERVED_USERNAME_MESSAGE, isReservedUsername } from "@/lib/reserved-usernames";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/mock-data";

export type TeamActionState = {
  success: boolean;
  message: string;
};

const workspaceSettingsSchema = z.object({
  workspaceName: z.string().trim().min(2),
  workspaceKind: z.enum(["studio", "barbershop", "company"]),
});

const createMemberSchema = z.object({
  fullName: z.string().trim().min(2),
  specialty: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().trim().min(3).regex(/^[a-z0-9-]+$/),
  city: z.string().trim().min(2),
});

const updateMemberSchema = z.object({
  memberProfileId: z.string().min(1),
  fullName: z.string().trim().min(2),
  specialty: z.string().trim().min(2),
  email: z.string().email(),
  username: z.string().trim().min(3).regex(/^[a-z0-9-]+$/),
  city: z.string().trim().min(2),
  password: z.string().trim().optional().default(""),
});

const toggleMemberStatusSchema = z.object({
  memberProfileId: z.string().min(1),
  nextStatus: z.enum(accountStatusValues),
});

async function requireAdminProfile() {
  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile ?? null;

  // workspaceId обязателен: все команды ниже фильтруют по нему, и пустое
  // значение не должно превратиться в запрос без ограничения по workspace.
  if (
    !profile ||
    !profile.workspaceId ||
    !canManageWorkspace(profile.accountRole) ||
    !isTeamWorkspaceKind(profile.workspaceKind)
  ) {
    return null;
  }

  return profile;
}

function revalidateTeamPaths() {
  revalidatePath("/team");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

function isLegacyMemberStatusSchemaError(error: unknown) {
  return (
    isSupabaseMissingColumnError(error, "account_status") ||
    isSupabaseMissingColumnError(error, "disabled_at") ||
    isSupabaseMissingColumnError(error, "disabled_by_profile_id")
  );
}

async function getWorkspaceMemberRow(input: {
  workspaceId: string;
  memberProfileId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: memberRow, error } = await admin
    .from("profiles")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.memberProfileId)
    .maybeSingle();

  if (error) {
    throw new Error("Не получилось загрузить сотрудника.");
  }

  return memberRow;
}

export async function updateWorkspaceSettingsAction(
  _prevState: TeamActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для управления студией нужно подключение к Supabase.",
    };
  }

  const profile = await requireAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "Доступ к админке есть только у администратора студии.",
    };
  }

  const parsed = workspaceSettingsSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      success: false,
      message: "Проверь название студии и тип бизнеса.",
    };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      workspace_name: parsed.data.workspaceName,
      workspace_kind: parsed.data.workspaceKind,
    })
    .eq("workspace_id", profile.workspaceId);

  if (error) {
    return {
      success: false,
      message: "Не получилось обновить данные студии.",
    };
  }

  revalidateTeamPaths();

  return {
    success: true,
    message: "Настройки студии сохранены.",
  };
}

// Хватает ли оплаченных мест ещё на одного активного сотрудника. Возвращает
// готовый отказ или null, если добавлять можно.
async function checkSeatAvailability(
  admin: SupabaseClient,
  profile: Profile,
): Promise<TeamActionState | null> {
  const access = resolveSubscription(profile);
  const balance = await loadSeatBalance(admin, {
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    planId: access.planId,
    subscriptionUntil: access.activeUntil,
    extraSeats: 1,
  });

  if (!balance.topUpRequired) {
    return null;
  }

  return {
    success: false,
    message: `Мест в оплаченном периоде не осталось. Период оплачен вперёд, до его конца ${balance.remainingDays} дн. — доплата за место ${balance.amountRub} ₽. Оплатить можно в настройках, вкладка «Аккаунт».`,
  };
}

export async function createTeamMemberAction(
  _prevState: TeamActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для создания сотрудника нужно подключение к Supabase.",
    };
  }

  const profile = await requireAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "Создавать сотрудников может только администратор студии.",
    };
  }

  // Тип рабочего пространства «студия» выбирается при регистрации бесплатно,
  // поэтому одной проверки isTeamWorkspaceKind мало — сотрудники входят в
  // тариф «Студия и барбершоп» и в пробный период.
  if (!hasCapability(profile, "team")) {
    return {
      success: false,
      message:
        "Сотрудники входят в тариф «Студия и барбершоп». Подключить его можно в настройках, вкладка «Аккаунт».",
    };
  }

  const parsed = createMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "Проверь имя, роль, email, пароль, username и город сотрудника.",
    };
  }

  if (isReservedUsername(parsed.data.username)) {
    return { success: false, message: RESERVED_USERNAME_MESSAGE };
  }

  const admin = createSupabaseAdminClient();

  // Место сверх оплаченных внутри длинного периода нужно оплатить сразу:
  // иначе год, купленный на одного мастера, покрывал бы команду любого
  // размера. При месячной оплате проверка молчит — там сотрудник просто
  // войдёт в следующий платёж, как и раньше.
  const seatBlock = await checkSeatAvailability(admin, profile);
  if (seatBlock) {
    return seatBlock;
  }
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", parsed.data.username)
    .maybeSingle();

  if (existingProfile) {
    return { success: false, message: "Этот username уже занят." };
  }

  const { data: createdUser, error: createUserError } =
    await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        workspace_name: profile.workspaceName,
      },
    });

  if (createUserError || !createdUser.user) {
    return {
      success: false,
      message: createUserError?.message || "Не получилось создать логин сотрудника.",
    };
  }

  const timezone = resolveTimezoneForCity(parsed.data.city);
  const locationText = getCityLabel(parsed.data.city);
  const profileInsert = {
    email: parsed.data.email,
    password_auth_id: createdUser.user.id,
    full_name: parsed.data.fullName,
    username: parsed.data.username,
    specialty: parsed.data.specialty,
    timezone,
    bio: "",
    location_text: locationText,
    workspace_id: profile.workspaceId,
    workspace_name: profile.workspaceName,
    workspace_kind: profile.workspaceKind,
    account_role: "staff",
    account_status: "active",
    created_by_profile_id: profile.id,
  };

  let { error: profileError } = await admin.from("profiles").insert(profileInsert);

  if (profileError && isSupabaseMissingColumnError(profileError, "account_status")) {
    const { account_status: _accountStatus, ...legacyInsert } = profileInsert;
    void _accountStatus;

    const retryResult = await admin.from("profiles").insert(legacyInsert);
    profileError = retryResult.error;
  }

  if (profileError) {
    await admin.auth.admin.deleteUser(createdUser.user.id);
    return {
      success: false,
      message: "Логин создался, но профиль сотрудника не записался в базу.",
    };
  }

  revalidateTeamPaths();

  return {
    success: true,
    message:
      "Сотрудник создан. Передай ему email и пароль, чтобы он вошел в свой отдельный кабинет.",
  };
}

export async function updateTeamMemberAction(
  _prevState: TeamActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для редактирования сотрудника нужно подключение к Supabase.",
    };
  }

  const profile = await requireAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "Редактировать сотрудников может только администратор студии.",
    };
  }

  const parsed = updateMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message:
        "Проверь имя, специализацию, email, username и город сотрудника.",
    };
  }

  if (parsed.data.password && parsed.data.password.length < 8) {
    return {
      success: false,
      message: "Новый пароль должен быть не короче 8 символов.",
    };
  }

  const timezone = resolveTimezoneForCity(parsed.data.city);
  const locationText = getCityLabel(parsed.data.city);
  const admin = createSupabaseAdminClient();
  const memberRow = await getWorkspaceMemberRow({
    workspaceId: profile.workspaceId,
    memberProfileId: parsed.data.memberProfileId,
  });

  if (!memberRow) {
    return { success: false, message: "Сотрудник не найден." };
  }

  // Проверяем только смену username: сотрудник, заведённый до появления
  // списка, должен сохранять остальные поля без принудительного переименования.
  if (
    parsed.data.username !== memberRow.username &&
    isReservedUsername(parsed.data.username)
  ) {
    return { success: false, message: RESERVED_USERNAME_MESSAGE };
  }

  const [{ data: usernameTaken }, { data: emailTaken }] = await Promise.all([
    admin
      .from("profiles")
      .select("id")
      .eq("username", parsed.data.username)
      .neq("id", parsed.data.memberProfileId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id")
      .eq("email", parsed.data.email)
      .neq("id", parsed.data.memberProfileId)
      .maybeSingle(),
  ]);

  if (usernameTaken) {
    return { success: false, message: "Этот username уже занят." };
  }

  if (emailTaken) {
    return { success: false, message: "Этот email уже используется в другом аккаунте." };
  }

  const emailChanged = parsed.data.email !== String(memberRow.email ?? "");
  const passwordChanged = parsed.data.password.length > 0;

  if (emailChanged || passwordChanged) {
    const { error: authError } = await admin.auth.admin.updateUserById(
      String(memberRow.password_auth_id),
      {
        email: parsed.data.email,
        ...(passwordChanged ? { password: parsed.data.password } : {}),
      },
    );

    if (authError) {
      return {
        success: false,
        message: authError.message || "Не получилось обновить логин или пароль сотрудника.",
      };
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      specialty: parsed.data.specialty,
      email: parsed.data.email,
      username: parsed.data.username,
      timezone,
      location_text: locationText,
    })
    .eq("id", parsed.data.memberProfileId)
    .eq("workspace_id", profile.workspaceId);

  if (profileError) {
    return {
      success: false,
      message:
        "Данные входа обновились не полностью. Проверь карточку сотрудника еще раз.",
    };
  }

  revalidateTeamPaths();

  return {
    success: true,
    message: passwordChanged
      ? "Карточка сотрудника и новый пароль сохранены."
      : "Карточка сотрудника обновлена.",
  };
}

export async function toggleTeamMemberStatusAction(
  _prevState: TeamActionState,
  formData: FormData,
) {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Для управления доступом сотрудника нужно подключение к Supabase.",
    };
  }

  const profile = await requireAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "Управлять доступом может только администратор студии.",
    };
  }

  const parsed = toggleMemberStatusSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return { success: false, message: "Не удалось определить сотрудника." };
  }

  if (profile.id === parsed.data.memberProfileId && parsed.data.nextStatus === "disabled") {
    return {
      success: false,
      message: "Нельзя отключить собственный кабинет администратора.",
    };
  }

  const admin = createSupabaseAdminClient();
  const memberRow = await getWorkspaceMemberRow({
    workspaceId: profile.workspaceId,
    memberProfileId: parsed.data.memberProfileId,
  });

  if (!memberRow) {
    return { success: false, message: "Сотрудник не найден." };
  }

  if (parsed.data.nextStatus === String(memberRow.account_status ?? "active")) {
    return {
      success: true,
      message:
        parsed.data.nextStatus === "disabled"
          ? "Кабинет уже отключен."
          : "Кабинет уже активен.",
    };
  }

  // Включение отключённого кабинета занимает место так же, как создание
  // нового сотрудника, — и проверяется так же.
  if (parsed.data.nextStatus === "active") {
    const seatBlock = await checkSeatAvailability(admin, profile);
    if (seatBlock) {
      return seatBlock;
    }
  }

  const banDuration = parsed.data.nextStatus === "disabled" ? "876000h" : "none";
  const { error: authError } = await admin.auth.admin.updateUserById(
    String(memberRow.password_auth_id),
    { ban_duration: banDuration },
  );

  if (authError) {
    return {
      success: false,
      message: authError.message || "Не получилось изменить доступ сотрудника.",
    };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      account_status: parsed.data.nextStatus,
      disabled_at:
        parsed.data.nextStatus === "disabled" ? new Date().toISOString() : null,
      disabled_by_profile_id:
        parsed.data.nextStatus === "disabled" ? profile.id : null,
    })
    .eq("id", parsed.data.memberProfileId)
    .eq("workspace_id", profile.workspaceId);

  if (profileError) {
    await admin.auth.admin.updateUserById(String(memberRow.password_auth_id), {
      ban_duration: parsed.data.nextStatus === "disabled" ? "none" : "876000h",
    });

    if (isLegacyMemberStatusSchemaError(profileError)) {
      return {
        success: false,
        message:
          "В базе еще нет полей статуса сотрудников. Прогони последнюю миграцию Supabase и повтори.",
      };
    }

    return {
      success: false,
      message: "Доступ обновился не полностью. Попробуй еще раз.",
    };
  }

  revalidateTeamPaths();

  return {
    success: true,
    message:
      parsed.data.nextStatus === "disabled"
        ? "Кабинет сотрудника отключен."
        : "Кабинет сотрудника снова активен.",
  };
}
