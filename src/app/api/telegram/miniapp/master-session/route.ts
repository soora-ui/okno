import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileByTelegramChat, touchTelegramLink } from "@/lib/telegram/link";
import { validateMiniAppInitData } from "@/lib/telegram/miniapp-auth";
import {
  getDefaultAccountRoute,
  isAccountActive,
  normalizeAccountRole,
  normalizeAccountStatus,
  normalizeWorkspaceKind,
} from "@/lib/workspace";

// Вход в кабинет мастера из мини-аппа, без пароля.
//
// Кто может войти: только тот Telegram-аккаунт, который мастер сам привязал
// из кабинета (auth_telegram_links, живая привязка). Привязка делается под
// парольной сессией одноразовым токеном, так что цепочка доверия такая:
// пароль → привязка чата → подпись Telegram.
//
// Что получает: обычную сессию кабинета, но с отметкой способа входа
// (magiclink). По ней действия с деньгами требуют пароль — см.
// src/lib/auth/session-origin.ts.
//
// Подпись здесь принимается только свежая. Обычным запросам мини-аппа хватает
// суток, но здесь на кону кабинет с телефонами клиентов: перехваченная строка
// initData не должна открывать его весь день.
const sessionInitDataMaxAgeSeconds = 60 * 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { initData?: string } | null;
  const result = validateMiniAppInitData(String(body?.initData ?? ""), {
    maxAgeSeconds: sessionInitDataMaxAgeSeconds,
  });

  if (result.status === "unconfigured") {
    return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  if (result.status !== "ok") {
    return NextResponse.json(
      { ok: false, reason: result.status === "expired" ? "expired" : "invalid" },
      { status: 401 },
    );
  }

  const linked = await getProfileByTelegramChat({
    telegramUserId: result.user.telegramUserId,
  });

  if (!linked) {
    return NextResponse.json({ ok: false, reason: "not_linked" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("id, password_auth_id, account_status, account_role, workspace_kind, workspace_id")
    .eq("id", linked.id)
    .maybeSingle();

  if (profileError || !profileRow?.password_auth_id) {
    return NextResponse.json({ ok: false, reason: "not_linked" }, { status: 403 });
  }

  // Отключённый администратором кабинет не открывается и отсюда — как и при
  // входе по паролю.
  if (!isAccountActive(normalizeAccountStatus(profileRow.account_status))) {
    return NextResponse.json({ ok: false, reason: "disabled" }, { status: 403 });
  }

  // Адрес берём у пользователя авторизации, а не из profiles.email: сессию
  // выдаёт сервер авторизации, и расхождение двух полей не должно привести к
  // входу в чужой аккаунт.
  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(
    String(profileRow.password_auth_id),
  );
  const email = authUser?.user?.email;

  if (authUserError || !email) {
    logError("Mini app master session: auth user not found", {
      profileId: linked.id,
      error: authUserError,
    });
    return NextResponse.json({ ok: false, reason: "failed" }, { status: 500 });
  }

  // Одноразовый токен входа: письмо не отправляется, токен сразу же
  // обменивается на сессию здесь, на сервере, и наружу не выходит.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;

  if (linkError || !tokenHash) {
    logError("Mini app master session: failed to issue token", {
      profileId: linked.id,
      error: linkError,
    });
    return NextResponse.json({ ok: false, reason: "failed" }, { status: 500 });
  }

  // Обмен идёт через клиент с cookie запроса: он и ставит сессию в ответ.
  // Сервисный клиент для этого не годится — он один на процесс, и сессия
  // мастера осела бы в нём.
  const supabase = await createSupabaseServerClient();
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });

  if (verifyError || verified.user?.id !== profileRow.password_auth_id) {
    if (verified?.session) {
      await supabase.auth.signOut();
    }

    logError("Mini app master session: token exchange failed", {
      profileId: linked.id,
      error: verifyError,
    });
    return NextResponse.json({ ok: false, reason: "failed" }, { status: 500 });
  }

  await Promise.all([
    touchTelegramLink({ telegramUserId: result.user.telegramUserId }),
    writeAuditLog({
      actorKind: "master",
      actorProfileId: linked.id,
      profileId: linked.id,
      workspaceId: profileRow.workspace_id ? String(profileRow.workspace_id) : null,
      eventType: "auth.telegram_miniapp_login",
      targetType: "profile",
      targetId: linked.id,
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      redirectTo: getDefaultAccountRoute({
        accountRole: normalizeAccountRole(profileRow.account_role),
        workspaceKind: normalizeWorkspaceKind(profileRow.workspace_kind),
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
