import { isSupabaseConfigured } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Журнал писем. И отправка, и вебхук пишут через одну процедуру в БД
// (record_notification_event): она сама решает, двигать ли статус вперёд, и
// делает это атомарно — параллельные вебхуки иначе затирали бы друг друга.

export type EmailLogStatus =
  | "queued"
  | "failed"
  | "accepted"
  | "sent"
  | "soft_bounced"
  | "delivered"
  | "opened"
  | "clicked"
  | "unsubscribed"
  | "subscribed"
  | "spam"
  | "hard_bounced";

export type RecordEmailLogInput = {
  jobId: string | null;
  recipient: string;
  status: EmailLogStatus;
  emailType?: string | null;
  subject?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
  // event_time вебхука в UTC. У записи при отправке события ещё нет.
  eventAt?: string | null;
};

export async function recordEmailLog(
  input: RecordEmailLogInput,
): Promise<{ ok: boolean; id: string | null }> {
  if (!isSupabaseConfigured) {
    return { ok: false, id: null };
  }

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("record_notification_event", {
    p_job_id: input.jobId,
    p_recipient: input.recipient,
    p_status: input.status,
    p_email_type: input.emailType ?? null,
    p_subject: input.subject ?? null,
    p_error_message: input.errorMessage ?? null,
    p_metadata: input.metadata ?? {},
    p_user_id: input.userId ?? null,
    p_event_at: input.eventAt ?? null,
  });

  if (error) {
    logError("Notification log write failed", {
      recipient: input.recipient,
      status: input.status,
      jobId: input.jobId,
      error,
    });

    return { ok: false, id: null };
  }

  return { ok: true, id: typeof data === "string" ? data : null };
}
