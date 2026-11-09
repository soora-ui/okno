"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured, isTelegramBotConfigured } from "@/lib/env";
import { writeAuditLog } from "@/lib/observability/audit";
import {
  isTelegramChatUnavailable,
  sendTelegramMessage,
} from "@/lib/telegram/api";
import {
  createTelegramLinkInvite,
  detachTelegramChat,
  markTelegramChatUnavailable,
  telegramLinkTokenTtlMinutes,
} from "@/lib/telegram/link";

export type TelegramActionState = {
  success: boolean;
  message: string;
  // Ссылка t.me/<bot>?start=… — одноразовая и живёт минуты, поэтому не
  // хранится и не показывается повторно: каждое нажатие выпускает новую.
  inviteUrl?: string;
};

async function requireProfile() {
  if (!isSupabaseConfigured) return null;

  const authProfile = await getCurrentAuthProfile();

  return authProfile?.profile ?? null;
}

function revalidateTelegramPaths() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function createTelegramInviteAction(
  _prevState: TelegramActionState,
): Promise<TelegramActionState> {
  // useActionState всегда передаёт prevState; действию он не нужен.
  void _prevState;
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  if (!isTelegramBotConfigured) {
    return {
      success: false,
      message: "Telegram-бот пока не подключен на платформе.",
    };
  }

  const invite = await createTelegramLinkInvite({ profileId: profile.id });

  if (!invite) {
    return {
      success: false,
      message: "Не получилось создать ссылку. Попробуй ещё раз через минуту.",
    };
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "telegram.invite.created",
    targetType: "profile",
    targetId: profile.id,
  });

  return {
    success: true,
    message: `Открой ссылку и нажми «Запустить» в Telegram. Ссылка действует ${telegramLinkTokenTtlMinutes} минут.`,
    inviteUrl: invite.url,
  };
}

export async function disconnectTelegramAction(
  _prevState: TelegramActionState,
): Promise<TelegramActionState> {
  // useActionState всегда передаёт prevState; действию он не нужен.
  void _prevState;
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const detached = await detachTelegramChat({ profileId: profile.id });

  if (!detached) {
    return {
      success: false,
      message: "Не получилось отключить. Попробуй ещё раз.",
    };
  }

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "telegram.disconnected",
    targetType: "profile",
    targetId: profile.id,
  });

  revalidateTelegramPaths();

  return {
    success: true,
    message: "Telegram отключен. Уведомления больше не приходят.",
  };
}

// Проверка доставки: единственный способ убедиться, что уведомления реально
// дойдут. Заодно ловит случай «мастер заблокировал бота» — тогда привязка
// гасится здесь же, и в настройках снова видно «не подключен».
export async function sendTelegramTestMessageAction(
  _prevState: TelegramActionState,
): Promise<TelegramActionState> {
  // useActionState всегда передаёт prevState; действию он не нужен.
  void _prevState;
  const profile = await requireProfile();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  if (!profile.telegramChatId) {
    return { success: false, message: "Бот ещё не подключен." };
  }

  const result = await sendTelegramMessage({
    chatId: profile.telegramChatId,
    text: "Проверка связи: уведомления okno доходят до этого чата.",
  });

  if (result.ok) {
    return { success: true, message: "Отправили тестовое сообщение в Telegram." };
  }

  if (isTelegramChatUnavailable(result)) {
    await markTelegramChatUnavailable({ chatId: profile.telegramChatId });
    revalidateTelegramPaths();

    return {
      success: false,
      message: "Похоже, бот заблокирован в Telegram. Разблокируй его и подключи заново.",
    };
  }

  return {
    success: false,
    message: "Сообщение не ушло. Попробуй ещё раз через минуту.",
  };
}
