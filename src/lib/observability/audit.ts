import { isSupabaseConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AuditActorKind = "master" | "client" | "system";
type AuditStatus = "success" | "failure";

type AuditMetadata = Record<string, unknown>;

export type AuditLogInput = {
  eventType: string;
  actorKind: AuditActorKind;
  actorProfileId?: string | null;
  profileId?: string | null;
  workspaceId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  status?: AuditStatus;
  message?: string | null;
  metadata?: AuditMetadata;
};

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Телефон может попасть в metadata значением, а не ключом — фильтра по именам
// ключей недостаточно. Строку с 10-15 цифрами считаем телефоноподобной,
// кроме заведомо безопасных форматов (ISO-дата, UUID).
function looksLikePhoneValue(value: string): boolean {
  if (ISO_TIMESTAMP_PATTERN.test(value) || UUID_PATTERN.test(value)) {
    return false;
  }

  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[truncated]";
  }

  if (typeof value === "string") {
    return looksLikePhoneValue(value) ? "[redacted]" : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sanitizeAuditValue(nested, depth + 1),
      ]),
    );
  }

  return value ?? null;
}

function sanitizeAuditMetadata(
  metadata: AuditMetadata | undefined,
): AuditMetadata | null {
  if (!metadata) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !/phone|password|token|secret|authorization|cookie|hash/i.test(key))
      .map(([key, value]) => [key, sanitizeAuditValue(value)]),
  );
}

export async function writeAuditLog(input: AuditLogInput) {
  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      actor_kind: input.actorKind,
      actor_profile_id: input.actorProfileId ?? null,
      profile_id: input.profileId ?? null,
      workspace_id: input.workspaceId ?? null,
      event_type: input.eventType,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      status: input.status ?? "success",
      message: input.message ?? null,
      metadata: sanitizeAuditMetadata(input.metadata),
    });

    if (error) {
      logError("Failed to write audit log", {
        eventType: input.eventType,
        status: input.status ?? "success",
        error,
      });
    }
  } catch (error) {
    logError("Unexpected audit logging failure", {
      eventType: input.eventType,
      status: input.status ?? "success",
      error,
    });
  }
}
