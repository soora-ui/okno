"use client";

import { useActionState } from "react";
import { BellRing, ExternalLink } from "lucide-react";
import {
  createTelegramInviteAction,
  disconnectTelegramAction,
  sendTelegramTestMessageAction,
  type TelegramActionState,
} from "@/app/actions/telegram";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Card } from "@/components/ui/card";
import { SettingsSectionHeading } from "@/components/settings/settings-section";
import type { Profile } from "@/lib/mock-data";

const initialState: TelegramActionState = { success: false, message: "" };

// Единственное место, где мастер подключает Telegram. Ссылка на бота
// одноразовая и живёт минуты, поэтому она не хранится в настройках: кнопка
// каждый раз выпускает новую, а старая тут же перестаёт работать.
export function TelegramConnectSection({ profile }: { profile: Profile }) {
  const [inviteState, createInvite] = useActionState(
    createTelegramInviteAction,
    initialState,
  );
  const [disconnectState, disconnect] = useActionState(
    disconnectTelegramAction,
    initialState,
  );
  const [testState, sendTest] = useActionState(
    sendTelegramTestMessageAction,
    initialState,
  );

  const isConnected = Boolean(profile.telegramChatId);

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <SettingsSectionHeading
        title="Telegram-уведомления"
        description="Бот пишет о новых записях и напоминает о визитах. Из чата видно расписание на сегодня и на неделю, а запись можно отменить, не заходя в кабинет."
        trailing={
          <span
            className={
              isConnected
                ? "inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success"
                : "inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning"
            }
          >
            <BellRing size={12} aria-hidden="true" />
            {isConnected ? "Подключено" : "Не подключено"}
          </span>
        }
      />

      <div className="rounded-panel bg-panel p-4">
        <p className="text-sm font-medium text-ink">
          {isConnected ? "Бот подключен" : "Бот не подключен"}
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          {isConnected
            ? "Уведомления приходят в Telegram. Команда /help в чате покажет, что ещё умеет бот."
            : "Нажми «Подключить», открой ссылку в Telegram и нажми «Запустить» — этого достаточно."}
        </p>
      </div>

      {isConnected ? (
        <div className="flex flex-wrap items-start gap-3">
          <form action={sendTest} className="space-y-2">
            <SubmitButton
              idleLabel="Проверить связь"
              pendingLabel="Отправляю..."
            />
          </form>
          <form action={disconnect} className="space-y-2">
            <SubmitButton idleLabel="Отключить" pendingLabel="Отключаю..." />
          </form>
        </div>
      ) : (
        <form action={createInvite} className="space-y-3">
          <SubmitButton idleLabel="Подключить" pendingLabel="Готовлю ссылку..." />
        </form>
      )}

      {inviteState.inviteUrl ? (
        <a
          href={inviteState.inviteUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
            color: "var(--ui-primary-text)",
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Открыть Telegram
          <ExternalLink size={16} />
        </a>
      ) : null}

      <FormMessage message={inviteState.message} success={inviteState.success} />
      <FormMessage message={testState.message} success={testState.success} />
      <FormMessage
        message={disconnectState.message}
        success={disconnectState.success}
      />
    </Card>
  );
}
