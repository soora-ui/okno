// Серверный приёмник технических ошибок: пишет их в таблицу error_events через
// сервис-роль, чтобы платформенный админ видел проблемы в панели. Best-effort:
// любая ошибка записи проглатывается (через console), чтобы сбор ошибок сам не
// ронял запрос. Импортировать ТОЛЬКО из серверного кода — тянет service-role
// ключ; в logger.ts он подгружается ленивым import под проверкой `window`.

import { isSupabaseConfigured } from "@/lib/env";
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

const sensitiveKey = /phone|password|token|secret|authorization|cookie|hash/i;

function sanitizeContext(
  context: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!context) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(context)
      .filter(([key]) => !sensitiveKey.test(key))
      .map(([key, value]) => [key, value ?? null]),
  );
}

export async function recordErrorEvent(input: ErrorEventInput): Promise<void> {
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
      context: sanitizeContext(input.context),
    });

    if (error) {
      // Не зовём logError, чтобы не зациклить сбор ошибок на самих себе.
      console.error("Failed to persist error event", error.message);
    }
  } catch (cause) {
    console.error("Unexpected error while persisting error event", cause);
  }
}
