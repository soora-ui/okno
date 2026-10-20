import type { SupabaseClient } from "@supabase/supabase-js";

// Мастер студии работает по тарифу студии: его оплачивает и продлевает
// администратор, а поля подписки у самого сотрудника пустые (free). Доступ,
// возможности и приём записей сотрудника считаем по профилю администратора —
// так же, как sitemap (src/lib/seo/public-profile.ts).

const PAYER_SUBSCRIPTION_COLUMNS =
  "subscription_tier, subscription_until, subscription_paused_until, created_at";

type ProfileRowLike = Record<string, unknown>;

export function isStaffRow(row: ProfileRowLike) {
  return String(row.account_role ?? "") === "staff" && Boolean(row.workspace_id);
}

export async function loadWorkspacePayerRow(
  client: SupabaseClient,
  workspaceId: string,
): Promise<ProfileRowLike | null> {
  const { data, error } = await client
    .from("profiles")
    .select(PAYER_SUBSCRIPTION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("account_role", "admin")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Не получилось загрузить тариф студии.");
  }

  return (data as ProfileRowLike | null) ?? null;
}

// Строка профиля сотрудника с подпиской администратора; остальные поля — свои.
// created_at тоже берём у администратора: пробный период у студии один.
export function withPayerSubscription<T extends ProfileRowLike>(
  row: T,
  payer: ProfileRowLike | null,
): T {
  if (!payer) return row;

  return {
    ...row,
    subscription_tier: payer.subscription_tier,
    subscription_until: payer.subscription_until,
    subscription_paused_until: payer.subscription_paused_until,
    created_at: payer.created_at,
  };
}

// Для сотрудника — строка с подпиской студии, для остальных — как есть.
export async function resolveSubscriptionRow<T extends ProfileRowLike>(
  client: SupabaseClient,
  row: T,
): Promise<T> {
  if (!isStaffRow(row)) return row;
  return withPayerSubscription(row, await loadWorkspacePayerRow(client, String(row.workspace_id)));
}
