// Серверный приёмник технических ошибок: пишет их в таблицу error_events через
// сервис-роль, чтобы платформенный админ видел проблемы в панели. Best-effort:
// любая ошибка записи проглатывается (через console), чтобы сбор ошибок сам не
// ронял запрос. Импортировать ТОЛЬКО из серверного кода — тянет service-role
// ключ; в logger.ts он подгружается ленивым import под проверкой `window`.

import { isErrorEventsEnabled, isSupabaseConfigured } from "@/lib/env";
import { sanitizeLogContext } from "@/lib/observability/sanitize";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ErrorEventInput = {
  level?: "warn" | "error";
  source?: "server" | "client";
  message: string;
  route?: string | null;
  digest?: string | null;
  profileId?: string | null;
  context?: Record<string, unknown> | null;
};

export async function recordErrorEvent(input: ErrorEventInput): Promise<void> {
  // В dev-сборке не пишем: .env.local смотрит на тот же проект Supabase, что и
  // прод, и ошибки локальной сборки (сломанный синтаксис, «Router action
  // dispatched before initialization») оседали в общей ленте /admin/errors.
  // Ошибки при этом никуда не деваются — logger по-прежнему пишет их в консоль.
  if (!isErrorEventsEnabled) {
    return;
  }

  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("error_events").insert({
      level: input.level ?? "error",
      source: input.source ?? "server",
      message: input.message.slice(0, 2000),
      route: input.route ?? null,
      digest: input.digest ?? null,
      profile_id: input.profileId ?? null,
      context: sanitizeLogContext(input.context),
    });

    if (error) {
      // Не зовём logError, чтобы не зациклить сбор ошибок на самих себе.
      console.error("Failed to persist error event", error.message);
    }
  } catch (cause) {
    console.error("Unexpected error while persisting error event", cause);
  }
}
