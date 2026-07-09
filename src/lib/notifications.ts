import { env, isSmsConfigured, isTelegramConfigured } from "@/lib/env";
import { sendSms } from "@/lib/sms";

export async function sendBookingConfirmationSms(input: {
  phone: string;
  masterName: string;
  serviceTitle: string;
  startsAtLabel: string;
}) {
  if (!isSmsConfigured) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendSms({
    phone: input.phone,
    message: `okno: запись к ${input.masterName} подтверждена. ${input.serviceTitle}, ${input.startsAtLabel}.`,
  });

  return { ok: result.ok, skipped: false as const };
}

export async function sendPhoneVerificationSms(input: {
  phone: string;
  code: string;
}) {
  if (!isSmsConfigured) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendSms({
    phone: input.phone,
    message: `okno: код подтверждения ${input.code}. Никому его не сообщайте.`,
  });

  return { ok: result.ok, skipped: false as const };
}

export async function sendMasterTelegramNotification(input: {
  chatId: string | null;
  clientName: string;
  serviceTitle: string;
  startsAtLabel: string;
}) {
  if (!isTelegramConfigured || !input.chatId) {
    return { ok: false as const, skipped: true as const };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: `Новая запись: ${input.clientName}, ${input.serviceTitle}, ${input.startsAtLabel}.`,
        }),
      },
    );

    return { ok: response.ok, skipped: false as const };
  } catch {
    return { ok: false as const, skipped: false as const };
  }
}

export async function sendClientReminderSms(input: {
  phone: string;
  masterName: string;
  serviceTitle: string;
  startsAtLabel: string;
}) {
  if (!isSmsConfigured) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendSms({
    phone: input.phone,
    message: `okno: напоминание о записи к ${input.masterName}. ${input.serviceTitle}, ${input.startsAtLabel}.`,
  });

  return { ok: result.ok, skipped: false as const };
}

export async function sendRepeatVisitReminderSms(input: {
  phone: string;
  masterName: string;
  serviceTitle: string;
}) {
  if (!isSmsConfigured) {
    return { ok: false as const, skipped: true as const };
  }

  const result = await sendSms({
    phone: input.phone,
    message: `okno: пора повторить «${input.serviceTitle}» у ${input.masterName}. Запишись на удобное время.`,
  });

  return { ok: result.ok, skipped: false as const };
}

export async function sendMasterReminderTelegram(input: {
  chatId: string | null;
  clientName: string;
  serviceTitle: string;
  startsAtLabel: string;
}) {
  if (!isTelegramConfigured || !input.chatId) {
    return { ok: false as const, skipped: true as const };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: `Напоминание: скоро визит. ${input.clientName}, ${input.serviceTitle}, ${input.startsAtLabel}.`,
        }),
      },
    );

    return { ok: response.ok, skipped: false as const };
  } catch {
    return { ok: false as const, skipped: false as const };
  }
}
