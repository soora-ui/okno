import { NextResponse } from "next/server";
import { env, isYooKassaOAuthConfigured } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import { logError, logWarn } from "@/lib/observability/logger";
import { writeAuditLog } from "@/lib/observability/audit";
import {
  exchangeOAuthCode,
  fetchYooKassaMe,
  syncMasterYooKassaWebhooks,
  upsertMasterYooKassaAccount,
  verifyOAuthState,
  type MasterYooKassaWebhook,
} from "@/lib/payments/yookassa-oauth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Коллбэк ЮKassa Partners API после согласия мастера на подключение
// (okno-tz-yookassa-oauth.md). Запрос приходит от браузера мастера (редирект
// с экрана ЮKassa), поэтому кука сессии на месте — используем RLS-клиент, а
// не service role.
function redirectToSettings(status: string) {
  return NextResponse.redirect(
    new URL(`/settings?tab=booking&yookassa=${status}`, env.appUrl),
  );
}

export async function GET(request: Request) {
  if (!isYooKassaOAuthConfigured) {
    return redirectToSettings("not_configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (providerError) {
    logWarn("YooKassa OAuth: provider returned error", { providerError });
    return redirectToSettings("error");
  }

  if (!code || !state) {
    return redirectToSettings("error");
  }

  const verifiedState = verifyOAuthState(state);
  if (!verifiedState) {
    logWarn("YooKassa OAuth: invalid or expired state");
    return redirectToSettings("error");
  }

  const authProfile = await getCurrentAuthProfile();
  if (
    !authProfile ||
    authProfile.source !== "supabase" ||
    authProfile.profile.id !== verifiedState.profileId
  ) {
    logWarn("YooKassa OAuth: callback session does not match state profile");
    return redirectToSettings("error");
  }

  const profile = authProfile.profile;

  try {
    const { accessToken, expiresInSeconds } = await exchangeOAuthCode(code);
    const me = await fetchYooKassaMe(accessToken);

    // Уведомления по платежам магазина мастера надо запросить отдельно: они
    // приходят на адрес, привязанный к его токену, а не к магазину платформы.
    // Если подписаться не вышло — сохраняем подключение неактивным
    // (status='disabled'): предоплату на услугах включить будет нельзя, и
    // мастер не окажется в ситуации, когда клиент платит, а бронь снимается
    // как неоплаченная.
    let webhooks: MasterYooKassaWebhook[] = [];
    let webhooksReady = true;
    try {
      webhooks = await syncMasterYooKassaWebhooks(accessToken);
    } catch (webhookError) {
      webhooksReady = false;
      logError("YooKassa OAuth: failed to subscribe master shop to webhooks", {
        profileId: profile.id,
        error: webhookError,
      });
    }

    const supabase = await createSupabaseServerClient();
    await upsertMasterYooKassaAccount(supabase, {
      profileId: profile.id,
      accountId: me.accountId,
      accessToken,
      expiresInSeconds,
      isTestShop: me.isTest,
      paymentMethods: me.paymentMethods,
      status: webhooksReady ? "enabled" : "disabled",
      webhooks,
    });

    await writeAuditLog({
      actorKind: "master",
      actorProfileId: profile.id,
      profileId: profile.id,
      eventType: webhooksReady
        ? "yookassa_oauth.connected"
        : "yookassa_oauth.connected_without_webhooks",
      targetType: "master_yookassa_account",
      metadata: { accountId: me.accountId, isTestShop: me.isTest, webhooksReady },
    });

    if (!webhooksReady) {
      return redirectToSettings("webhooks_failed");
    }

    return redirectToSettings(me.isTest ? "connected_test" : "connected");
  } catch (error) {
    logError("YooKassa OAuth: callback failed", { profileId: profile.id, error });
    return redirectToSettings("error");
  }
}
