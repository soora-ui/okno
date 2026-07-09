import { notFound } from "next/navigation";
import { getCurrentAuthProfile } from "@/lib/data";
import { adminEmails, isAdminConfigured } from "@/lib/env";
import type { Profile } from "@/lib/mock-data";

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email || !isAdminConfigured) {
    return false;
  }

  return adminEmails.includes(email.trim().toLowerCase());
}

// Возвращает профиль текущего админа либо null. Используем в местах, где нужно
// мягко проверить доступ (например, показать пункт меню), без выброса 404.
export async function getPlatformAdminProfile(): Promise<Profile | null> {
  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile ?? null;

  if (!profile || !isPlatformAdminEmail(profile.email)) {
    return null;
  }

  return profile;
}

// Жёсткая защита для страниц и server actions админки. Не-админам отдаём 404,
// чтобы не раскрывать сам факт существования панели.
export async function requirePlatformAdmin(): Promise<Profile> {
  const profile = await getPlatformAdminProfile();

  if (!profile) {
    notFound();
  }

  return profile;
}
