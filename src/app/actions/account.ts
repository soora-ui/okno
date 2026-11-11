"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getCurrentAuthProfile } from "@/lib/data";
import { env, isSupabaseConfigured } from "@/lib/env";
import { brandMaterialsBucket } from "@/lib/brand-theme/storage";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { profileMediaBucket } from "@/lib/profile-media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canManageWorkspace, isTeamWorkspaceKind } from "@/lib/workspace";

export type DeleteAccountState = {
  success: boolean;
  message: string;
};

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Пароль проверяем отдельным клиентом без сессии: вход на серверном клиенте
// переписал бы куки текущей сессии, а нам нужен только ответ «подошёл или нет».
async function verifyPassword(email: string, password: string) {
  const client = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}

// Storage не умеет удалять «папку», поэтому собираем пути рекурсивно:
// list() отдаёт вложенные папки записями без id.
async function listStoragePaths(admin: AdminClient, bucket: string, prefix: string) {
  const paths: string[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset });

    if (error || !data) {
      break;
    }

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) {
        paths.push(path);
      } else {
        paths.push(...(await listStoragePaths(admin, bucket, path)));
      }
    }

    if (data.length < pageSize) {
      break;
    }
  }

  return paths;
}

// Файлы лежат под id учётной записи (profile-media) или id профиля
// (brand-materials) — чистим оба префикса в обоих бакетах.
async function removeAccountFiles(admin: AdminClient, prefixes: string[]) {
  for (const bucket of [profileMediaBucket, brandMaterialsBucket]) {
    for (const prefix of prefixes) {
      try {
        const paths = await listStoragePaths(admin, bucket, prefix);
        for (let index = 0; index < paths.length; index += 100) {
          await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
        }
      } catch (error) {
        logError("Failed to remove account files", { bucket, prefix, error });
      }
    }
  }
}

export async function deleteAccountAction(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Удаление аккаунта недоступно в демо-режиме." };
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.source === "supabase" ? authProfile.profile : null;
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  if (profile.accountRole === "staff") {
    return {
      success: false,
      message: "Аккаунт сотрудника удаляет администратор студии.",
    };
  }

  const password = String(formData.get("password") ?? "");
  if (!password) {
    return { success: false, message: "Введи пароль, чтобы подтвердить удаление." };
  }

  if (!(await verifyPassword(profile.email, password))) {
    return { success: false, message: "Пароль введён неверно." };
  }

  const admin = createSupabaseAdminClient();

  // Администратор студии удаляет студию целиком: без него сотрудники остались
  // бы в workspace без владельца и плательщика.
  let accounts: Array<{ id: string; authId: string }> = [
    { id: profile.id, authId: profile.passwordAuthId },
  ];

  if (
    profile.workspaceId &&
    canManageWorkspace(profile.accountRole) &&
    isTeamWorkspaceKind(profile.workspaceKind)
  ) {
    const { data: members, error } = await admin
      .from("profiles")
      .select("id, password_auth_id")
      .eq("workspace_id", profile.workspaceId);

    if (error) {
      logError("Failed to load workspace members for deletion", {
        profileId: profile.id,
        error,
      });
      return { success: false, message: "Не получилось удалить аккаунт. Попробуй ещё раз." };
    }

    accounts = (members ?? []).map((row) => ({
      id: String(row.id),
      authId: String(row.password_auth_id),
    }));
  }

  const profileIds = accounts.map((account) => account.id);

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "account.deleted",
    targetType: "profile",
    targetId: profile.id,
    metadata: { deletedProfileIds: profileIds },
  });

  await removeAccountFiles(
    admin,
    accounts.flatMap((account) => [account.id, account.authId]),
  );

  // Записи, клиенты, услуги, платёжные методы и прочее уходят каскадом
  // от profiles; логи и чеки остаются с profile_id = null.
  const { error: profilesError } = await admin
    .from("profiles")
    .delete()
    .in("id", profileIds);

  if (profilesError) {
    logError("Failed to delete profiles", { profileIds, error: profilesError });
    return { success: false, message: "Не получилось удалить аккаунт. Попробуй ещё раз." };
  }

  for (const account of accounts) {
    const { error } = await admin.auth.admin.deleteUser(account.authId);
    if (error) {
      logError("Failed to delete auth user", { profileId: account.id, error });
    }
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  redirect("/login?reason=deleted");
}
