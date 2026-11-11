import { NextResponse } from "next/server";
import { isTelegramOriginSession } from "@/lib/auth/session-origin";
import { env, isYooKassaOAuthConfigured } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import { buildAuthorizeUrl, createOAuthState } from "@/lib/payments/yookassa-oauth";
import { hasCapability } from "@/lib/subscription";

// Начало OAuth-подключения мастера к ЮKassa Partners API
// (okno-tz-yookassa-oauth.md). Профиль мастера берём из текущей сессии, а не
// из query — иначе можно было бы подключить чужой аккаунт, подставив id в
// ссылку.
export async function GET() {
  if (!isYooKassaOAuthConfigured) {
    return NextResponse.redirect(
      new URL("/settings?tab=booking&yookassa=not_configured", env.appUrl),
    );
  }

  const authProfile = await getCurrentAuthProfile();
  if (!authProfile || authProfile.source !== "supabase") {
    return NextResponse.redirect(new URL("/login", env.appUrl));
  }

  // Вход из мини-аппа Telegram паролем не подтверждён. Подключить магазин —
  // значит решить, куда пойдут деньги клиентов, поэтому сначала пароль.
  if (await isTelegramOriginSession()) {
    return NextResponse.redirect(
      new URL("/settings?tab=account&yookassa=password_required", env.appUrl),
    );
  }

  // Магазин подключают ради предоплаты — на тарифах без неё подключение
  // бессмысленно и создаёт у мастера ложное ожидание, что деньги пойдут.
  if (!hasCapability(authProfile.profile, "prepayment")) {
    return NextResponse.redirect(
      new URL("/settings?tab=services&yookassa=plan_required", env.appUrl),
    );
  }

  const state = createOAuthState(authProfile.profile.id);
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
