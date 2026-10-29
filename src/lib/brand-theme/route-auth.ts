import { NextResponse } from "next/server";
import type { Profile } from "@/lib/mock-data";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured, isSupportAssistantConfigured } from "@/lib/env";
import { hasCapability } from "@/lib/subscription";

// Общая проверка для маршрутов фирменного стиля: вход, тариф, настроенные
// Supabase и Claude. Возвращает профиль или готовый ответ с ошибкой.
export async function requireBrandThemeProfile(
  // requirePlan: false — для действий над своими данными (посмотреть и
  // удалить файлы), которые доступны и после окончания тарифа.
  options: { needsClaude?: boolean; requirePlan?: boolean } = {},
): Promise<{ profile: Profile } | { response: NextResponse }> {
  if (!isSupabaseConfigured || (options.needsClaude && !isSupportAssistantConfigured)) {
    return {
      response: NextResponse.json({ error: "Фирменный стиль сейчас недоступен." }, { status: 503 }),
    };
  }

  const authProfile = await getCurrentAuthProfile();
  const profile = authProfile?.profile;
  if (!profile) {
    return {
      response: NextResponse.json({ error: "Сессия истекла. Войдите заново." }, { status: 401 }),
    };
  }
  if (options.requirePlan !== false && !hasCapability(profile, "brandTheme")) {
    return {
      response: NextResponse.json(
        { error: "Фирменный стиль доступен на тарифах «Расширенный» и «Студия»." },
        { status: 403 },
      ),
    };
  }
  return { profile };
}
