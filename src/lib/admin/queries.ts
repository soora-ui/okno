import { DateTime } from "luxon";
import type { FeedbackKind, FeedbackStatus } from "@/lib/feedback/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseMissingTableError } from "@/lib/supabase/auth-errors";
import { planIds } from "@/config/plans";

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

// Одна и та же поломка пишет по строке на каждое повторение: упавший каждый
// час крон за двое суток даёт под сотню одинаковых записей. В панели такие
// строки сворачиваются в одну группу — иначе живая ошибка теряется среди
// копий давно починенной.
export type ErrorEventGroup = {
  key: string;
  level: string;
  source: string;
  message: string;
  route: string | null;
  digest: string | null;
  count: number;
  unresolvedCount: number;
  // Id нерешённых событий группы — по ним кнопка «Решено» закрывает её целиком.
  unresolvedIds: string[];
  firstSeen: string;
  lastSeen: string;
  // Контекст самого свежего события группы: у повторов он одинаковый, а если
  // и разошёлся, смотреть нужно на последнее.
  latestContext: Record<string, unknown> | null;
};

export type ErrorEventGroupsResult = {
  groups: ErrorEventGroup[];
  // Сколько событий попало в выборку и каков был потолок: если упёрлись в
  // потолок, в панели честно пишем, что показана не вся история.
  scanned: number;
  scanLimit: number;
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
      // Считаем любой оплаченный тариф, а не только legacy-значение "pro":
      // после перехода на сетку мастера лежат под solo-basic/solo-plus/studio.
      .in("subscription_tier", ["pro", ...planIds])
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

// Число нерешённых проблем (не событий) — то же, что показывает список: в
// значке навигации «338» из тридцати девяти копий одной поломки пугают
// сильнее, чем помогают. Колонку context намеренно не тянем: запрос идёт на
// каждой странице админки.
export async function getUnresolvedErrorGroupCount(scanLimit = 1000): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const result = await supabase
    .from("error_events")
    .select("level, source, message, route, digest, context")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(scanLimit);

  if (result.error && isSupabaseMissingTableError(result.error, "error_events")) {
    return 0;
  }

  const keys = new Set(
    (result.data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const context = (record.context as Record<string, unknown> | null) ?? null;
      return [
        String(record.level ?? "error"),
        String(record.source ?? "server"),
        String(record.message ?? ""),
        (record.route as string | null) ??
          (typeof context?.routePath === "string" ? context.routePath : ""),
        (record.digest as string | null) ??
          (typeof context?.digest === "string" ? context.digest : ""),
      ].join("\u0000");
    }),
  );

  return keys.size;
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

// Свёртка событий в группы. Postgres сделал бы это одним group by, но у
// supabase-js нет агрегатов без RPC, поэтому берём окно последних событий и
// группируем в памяти: таблица админская, окна в тысячу строк хватает с
// запасом, а его размер виден в интерфейсе.
export async function getGroupedErrorEvents(input?: {
  scanLimit?: number;
  onlyUnresolved?: boolean;
}): Promise<ErrorEventGroupsResult> {
  const scanLimit = input?.scanLimit ?? 1000;
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("error_events")
    .select("id, level, source, message, route, digest, resolved, created_at, context")
    .order("created_at", { ascending: false })
    .limit(scanLimit);

  if (input?.onlyUnresolved) {
    query = query.eq("resolved", false);
  }

  const { data, error } = await query;

  if (error && isSupabaseMissingTableError(error, "error_events")) {
    return { groups: [], scanned: 0, scanLimit };
  }

  const rows = data ?? [];
  const groups = new Map<string, ErrorEventGroup>();

  for (const row of rows) {
    const record = row as Record<string, unknown>;
    const level = String(record.level ?? "error");
    const source = String(record.source ?? "server");
    const message = String(record.message ?? "");
    const context = (record.context as Record<string, unknown> | null) ?? null;
    // У событий, записанных до того, как logger стал раскладывать route и
    // digest по колонкам, они лежат только в контексте — читаем оттуда, иначе
    // вся старая история схлопнется в одну огромную группу.
    const route =
      (record.route as string | null) ??
      (typeof context?.routePath === "string" ? context.routePath : null);
    // Разные digest — разные баги под одним заголовком «Unhandled application
    // error», поэтому в ключ он входит наравне с текстом.
    const digest =
      (record.digest as string | null) ??
      (typeof context?.digest === "string" ? context.digest : null);
    const createdAt = String(record.created_at ?? "");
    const key = [level, source, message, route ?? "", digest ?? ""].join("\u0000");

    const existing = groups.get(key);

    if (!existing) {
      // Строки идут от свежих к старым, поэтому первая встреченная — последняя
      // по времени.
      groups.set(key, {
        key,
        level,
        source,
        message,
        route,
        digest,
        count: 1,
        unresolvedCount: record.resolved ? 0 : 1,
        unresolvedIds: record.resolved ? [] : [String(record.id)],
        firstSeen: createdAt,
        lastSeen: createdAt,
        latestContext: context,
      });
      continue;
    }

    existing.count += 1;
    if (!record.resolved) {
      existing.unresolvedCount += 1;
      existing.unresolvedIds.push(String(record.id));
    }
    if (createdAt && createdAt < existing.firstSeen) existing.firstSeen = createdAt;
    if (createdAt && createdAt > existing.lastSeen) existing.lastSeen = createdAt;
  }

  return {
    // Сверху то, что случилось недавно: чинить надо живое, а не самое частое.
    groups: [...groups.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
    scanned: rows.length,
    scanLimit,
  };
}

// Обращения, на которые AI-поддержка не смогла ответить сама. Список
// работает как перечень пробелов в карте сервиса: каждая строка — вопрос, на
// который бот не нашёл ответа, вместе с тем, что в итоге ответил человек.
// Из этих пар и дописываются новые темы в src/lib/support-assistant/sitemap.ts.
export type SupportEscalationEntry = {
  id: string;
  code: string;
  status: string;
  summary: string;
  question: string;
  draftAnswer: string;
  operatorReply: string | null;
  deliveredReply: string | null;
  masterName: string | null;
  masterEmail: string | null;
  createdAt: string;
  answeredAt: string | null;
};

export async function getSupportEscalations(
  limit = 100,
): Promise<SupportEscalationEntry[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("support_escalations")
    .select(
      "id, code, status, summary, question, draft_answer, operator_reply, delivered_reply, created_at, answered_at, profiles(full_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error && isSupabaseMissingTableError(error, "support_escalations")) {
    return [];
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    // Supabase отдаёт связанную строку объектом или массивом в зависимости от
    // того, как разобрал связь, — приводим к одному виду.
    const rawMaster = record.profiles;
    const master = (Array.isArray(rawMaster) ? rawMaster[0] : rawMaster) as
      | Record<string, unknown>
      | undefined;

    return {
      id: String(record.id),
      code: String(record.code ?? ""),
      status: String(record.status ?? "pending"),
      summary: String(record.summary ?? ""),
      question: String(record.question ?? ""),
      draftAnswer: String(record.draft_answer ?? ""),
      operatorReply: (record.operator_reply as string | null) ?? null,
      deliveredReply: (record.delivered_reply as string | null) ?? null,
      masterName: (master?.full_name as string | null) ?? null,
      masterEmail: (master?.email as string | null) ?? null,
      createdAt: String(record.created_at ?? ""),
      answeredAt: (record.answered_at as string | null) ?? null,
    };
  });
}

// ---- Обратная связь мастеров ----

export type AdminFeedbackEntry = {
  id: string;
  kind: FeedbackKind;
  channel: string;
  reason: string | null;
  message: string;
  context: Record<string, unknown>;
  status: FeedbackStatus;
  adminReply: string | null;
  replySentAt: string | null;
  replyChannel: string | null;
  createdAt: string;
  masterName: string | null;
  masterEmail: string | null;
  masterUsername: string | null;
};

export type FeedbackFilter = "open" | "ideas" | "cancel" | "trial" | "pulse" | "all";

const feedbackFilterKinds: Record<FeedbackFilter, FeedbackKind[] | null> = {
  open: null,
  ideas: ["idea", "bug"],
  cancel: ["cancel"],
  trial: ["trial_ending", "trial_ended"],
  pulse: ["pulse"],
  all: null,
};

export async function getMasterFeedback(input: {
  filter: FeedbackFilter;
  limit?: number;
}): Promise<AdminFeedbackEntry[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("master_feedback")
    .select(
      "id, kind, channel, reason, message, context, status, admin_reply, reply_sent_at, reply_channel, created_at, profiles(full_name, email, username)",
    )
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 200);

  const kinds = feedbackFilterKinds[input.filter];

  if (kinds) {
    query = query.in("kind", kinds);
  }

  // «Открытые» — то, что требует внимания: новые и запланированные идеи и
  // проблемы. Ответы на опросы — статистика, их разбирают сводкой выше.
  if (input.filter === "open") {
    query = query.in("kind", ["idea", "bug"]).in("status", ["new", "planned"]);
  }

  const { data, error } = await query;

  if (error) {
    if (isSupabaseMissingTableError(error, "master_feedback")) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const rawMaster = record.profiles;
    const master = (Array.isArray(rawMaster) ? rawMaster[0] : rawMaster) as
      | Record<string, unknown>
      | undefined;

    return {
      id: String(record.id),
      kind: record.kind as FeedbackKind,
      channel: String(record.channel ?? "site"),
      reason: (record.reason as string | null) ?? null,
      message: String(record.message ?? ""),
      context: (record.context as Record<string, unknown> | null) ?? {},
      status: record.status as FeedbackStatus,
      adminReply: (record.admin_reply as string | null) ?? null,
      replySentAt: (record.reply_sent_at as string | null) ?? null,
      replyChannel: (record.reply_channel as string | null) ?? null,
      createdAt: String(record.created_at ?? ""),
      masterName: (master?.full_name as string | null) ?? null,
      masterEmail: (master?.email as string | null) ?? null,
      masterUsername: (master?.username as string | null) ?? null,
    };
  });
}

export type FeedbackSummary = {
  // Вопрос Эллиса за последние полгода.
  pulseTotal: number;
  pulseVery: number;
  pulseSomewhat: number;
  pulseNot: number;
  // Причины отключения автопродления и сколько из них ушли в паузу.
  cancelReasons: { reason: string; count: number }[];
  cancelTotal: number;
  savedByPause: number;
  trialReasons: { reason: string; count: number }[];
  trialTotal: number;
  openIdeas: number;
};

function countBy(rows: { reason: string | null }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.reason ?? "—";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

export async function getFeedbackSummary(): Promise<FeedbackSummary> {
  const supabase = createSupabaseAdminClient();
  const since = DateTime.now().minus({ days: 180 }).toUTC().toISO();
  const { data, error } = await supabase
    .from("master_feedback")
    .select("kind, reason, status, context")
    .gte("created_at", since)
    .limit(5000);

  if (error && !isSupabaseMissingTableError(error, "master_feedback")) {
    throw error;
  }

  const rows = (data ?? []) as {
    kind: FeedbackKind;
    reason: string | null;
    status: FeedbackStatus;
    context: Record<string, unknown> | null;
  }[];
  const pulse = rows.filter((row) => row.kind === "pulse");
  const cancel = rows.filter((row) => row.kind === "cancel");
  const trial = rows.filter((row) => row.kind === "trial_ending" || row.kind === "trial_ended");

  return {
    pulseTotal: pulse.length,
    pulseVery: pulse.filter((row) => row.reason === "very").length,
    pulseSomewhat: pulse.filter((row) => row.reason === "somewhat").length,
    pulseNot: pulse.filter((row) => row.reason === "not").length,
    cancelReasons: countBy(cancel),
    cancelTotal: cancel.length,
    savedByPause: cancel.filter((row) => row.context?.outcome === "paused").length,
    trialReasons: countBy(trial),
    trialTotal: trial.length,
    openIdeas: rows.filter(
      (row) => (row.kind === "idea" || row.kind === "bug") && row.status === "new",
    ).length,
  };
}

export async function getNewFeedbackCount(): Promise<number> {
  const { count, error } = await createSupabaseAdminClient()
    .from("master_feedback")
    .select("id", { count: "exact", head: true })
    .in("kind", ["idea", "bug"])
    .eq("status", "new");

  return error ? 0 : (count ?? 0);
}
