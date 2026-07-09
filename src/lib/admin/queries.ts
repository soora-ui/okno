import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";

// Все запросы идут через сервис-роль (обходит RLS): админка видит данные всей
// платформы. Вызывать только из защищённых requirePlatformAdmin() контекстов.

export type PlatformMetrics = {
  totalMasters: number;
  activePro: number;
  newMasters7d: number;
  newMasters30d: number;
  totalBookings: number;
  totalClients: number;
};

export type MoneyMetrics = {
  revenueRub: number;
  succeededCount: number;
  pendingCount: number;
};

export type RecentPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  plan: string;
  createdAt: string;
  masterEmail: string | null;
  masterName: string | null;
};

export type AuditLogEntry = {
  id: string;
  eventType: string;
  actorKind: string;
  status: string;
  message: string | null;
  targetType: string | null;
  createdAt: string;
};

export type ErrorEventEntry = {
  id: string;
  level: string;
  source: string;
  message: string;
  route: string | null;
  resolved: boolean;
  createdAt: string;
  context: Record<string, unknown> | null;
};

function countOf(result: { count: number | null }): number {
  return result.count ?? 0;
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalMasters,
    activePro,
    newMasters7d,
    newMasters30d,
    totalBookings,
    totalClients,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("subscription_tier", "pro")
      .or(`subscription_until.is.null,subscription_until.gt.${nowIso}`),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7d),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30d),
    supabase.from("bookings").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalMasters: countOf(totalMasters),
    activePro: countOf(activePro),
    newMasters7d: countOf(newMasters7d),
    newMasters30d: countOf(newMasters30d),
    totalBookings: countOf(totalBookings),
    totalClients: countOf(totalClients),
  };
}

export async function getMoneyMetrics(): Promise<MoneyMetrics> {
  const supabase = createSupabaseAdminClient();

  const [succeededRows, succeededCount, pendingCount] = await Promise.all([
    supabase
      .from("subscription_payments")
      .select("amount")
      .eq("status", "succeeded"),
    supabase
      .from("subscription_payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "succeeded"),
    supabase
      .from("subscription_payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const revenueRub = (succeededRows.data ?? []).reduce(
    (sum, row) => sum + Number((row as { amount?: number }).amount ?? 0),
    0,
  );

  return {
    revenueRub,
    succeededCount: countOf(succeededCount),
    pendingCount: countOf(pendingCount),
  };
}

export async function getRecentPayments(limit = 20): Promise<RecentPayment[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("subscription_payments")
    .select(
      "id, amount, currency, status, plan, created_at, profile:profiles(email, full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const profile = (record.profile ?? null) as
      | { email?: string; full_name?: string }
      | null;

    return {
      id: String(record.id),
      amount: Number(record.amount ?? 0),
      currency: String(record.currency ?? "RUB"),
      status: String(record.status ?? "pending"),
      plan: String(record.plan ?? "pro"),
      createdAt: String(record.created_at ?? ""),
      masterEmail: profile?.email ?? null,
      masterName: profile?.full_name ?? null,
    };
  });
}

export async function getRecentAuditLogs(limit = 50): Promise<AuditLogEntry[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, event_type, actor_kind, status, message, target_type, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id),
      eventType: String(record.event_type ?? ""),
      actorKind: String(record.actor_kind ?? ""),
      status: String(record.status ?? "success"),
      message: (record.message as string | null) ?? null,
      targetType: (record.target_type as string | null) ?? null,
      createdAt: String(record.created_at ?? ""),
    };
  });
}

export async function getUnresolvedErrorCount(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const result = await supabase
    .from("error_events")
    .select("id", { count: "exact", head: true })
    .eq("resolved", false);

  // Таблица появляется после миграции 202606240001 — до неё панель не должна
  // падать, просто показываем 0.
  if (result.error && isSupabaseMissingTableError(result.error, "error_events")) {
    return 0;
  }

  return countOf(result);
}

export async function getRecentErrorEvents(input?: {
  limit?: number;
  onlyUnresolved?: boolean;
}): Promise<ErrorEventEntry[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("error_events")
    .select("id, level, source, message, route, resolved, created_at, context")
    .order("created_at", { ascending: false })
    .limit(input?.limit ?? 100);

  if (input?.onlyUnresolved) {
    query = query.eq("resolved", false);
  }

  const { data, error } = await query;

  if (error && isSupabaseMissingTableError(error, "error_events")) {
    return [];
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id),
      level: String(record.level ?? "error"),
      source: String(record.source ?? "server"),
      message: String(record.message ?? ""),
      route: (record.route as string | null) ?? null,
      resolved: Boolean(record.resolved),
      createdAt: String(record.created_at ?? ""),
      context: (record.context as Record<string, unknown> | null) ?? null,
    };
  });
}
