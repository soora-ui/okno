"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { DateTime } from "luxon";
import { z } from "zod";
import { getCurrentAuthProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import {
  type FeedbackKind,
  feedbackMessageMaxLength,
  reasonsFor,
} from "@/lib/feedback/config";
import { dismissFeedbackPrompt, recordFeedback } from "@/lib/feedback/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { endSubscriptionPause, startSubscriptionPause } from "@/lib/subscription-pause";
import { canManageWorkspace } from "@/lib/workspace";

export type FeedbackActionState = {
  success: boolean;
  message: string;
};

// Больше этого за сутки от одного мастера — уже не обратная связь, а сбой
// или чья-то игра с формой. Админу в Telegram такой поток не нужен.
const dailyFeedbackLimit = 15;

async function requireMaster() {
  if (!isSupabaseConfigured) {
    return null;
  }

  const authProfile = await getCurrentAuthProfile();
  return authProfile?.source === "supabase" ? authProfile.profile : null;
}

async function requestContext(path: unknown) {
  const userAgent = (await headers()).get("user-agent") ?? "";

  return {
    path: typeof path === "string" ? path.slice(0, 200) : null,
    device: /mobile|iphone|android/i.test(userAgent) ? "mobile" : "desktop",
  };
}

async function isOverDailyLimit(profileId: string) {
  const { count } = await createSupabaseAdminClient()
    .from("master_feedback")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", DateTime.now().minus({ days: 1 }).toUTC().toISO());

  return (count ?? 0) >= dailyFeedbackLimit;
}

const ideaSchema = z.object({
  kind: z.enum(["idea", "bug"]),
  message: z
    .string()
    .trim()
    .min(5, "Опиши чуть подробнее — хотя бы пару слов.")
    .max(feedbackMessageMaxLength, "Слишком длинно — сократи, пожалуйста."),
});

export async function submitFeedbackAction(
  _prevState: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const profile = await requireMaster();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = ideaSchema.safeParse({
    kind: formData.get("kind"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Проверь форму." };
  }

  if (await isOverDailyLimit(profile.id)) {
    return { success: false, message: "Сегодня ты уже много написал — продолжим завтра." };
  }

  const saved = await recordFeedback({
    profile,
    kind: parsed.data.kind,
    channel: "site",
    message: parsed.data.message,
    context: await requestContext(formData.get("path")),
  });

  if (!saved) {
    return { success: false, message: "Не получилось отправить. Попробуй ещё раз." };
  }

  revalidatePath("/feedback");
  return {
    success: true,
    message:
      parsed.data.kind === "bug"
        ? "Спасибо! Посмотрим и ответим здесь или в Telegram."
        : "Спасибо! Идея у команды — когда сделаем, напишем тебе.",
  };
}

const promptSchema = z.object({
  key: z.string().regex(/^(trial_ending|trial_ended|pulse:\d+)$/),
  kind: z.enum(["trial_ending", "trial_ended", "pulse"]),
  reason: z.string().min(1, "Выбери вариант ответа."),
  message: z.string().trim().max(feedbackMessageMaxLength).optional(),
});

export async function answerFeedbackPromptAction(
  _prevState: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const profile = await requireMaster();

  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = promptSchema.safeParse({
    key: formData.get("key"),
    kind: formData.get("kind"),
    reason: formData.get("reason") ?? "",
    message: formData.get("message") ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Проверь форму." };
  }

  const kind: FeedbackKind = parsed.data.kind;

  if (!reasonsFor(kind).some((reason) => reason.code === parsed.data.reason)) {
    return { success: false, message: "Выбери вариант ответа." };
  }

  const saved = await recordFeedback({
    profile,
    kind,
    channel: "site",
    reason: parsed.data.reason,
    message: parsed.data.message,
    promptKey: parsed.data.key,
    context: await requestContext("/dashboard"),
  });

  if (!saved) {
    return { success: false, message: "Не получилось отправить. Попробуй ещё раз." };
  }

  revalidatePath("/dashboard");
  return { success: true, message: "Спасибо, это правда помогает!" };
}

export async function dismissFeedbackPromptAction(formData: FormData): Promise<void> {
  const profile = await requireMaster();
  const key = formData.get("key");

  if (!profile || typeof key !== "string" || !/^(trial_ending|trial_ended|pulse:\d+)$/.test(key)) {
    return;
  }

  await dismissFeedbackPrompt({ profileId: profile.id, key });
  revalidatePath("/dashboard");
}

// ---- Пауза ----

const pauseSchema = z.object({
  days: z.coerce.number().int(),
  // Пауза, выбранная в опросе при отключении автопродления: причину пишем
  // в обратную связь — «удержали паузой» тоже исход, который стоит считать.
  reason: z.string().optional(),
  message: z.string().trim().max(feedbackMessageMaxLength).optional(),
});

export async function pauseSubscriptionAction(
  _prevState: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const profile = await requireMaster();

  if (!profile || !canManageWorkspace(profile.accountRole)) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = pauseSchema.safeParse({
    days: formData.get("days"),
    reason: formData.get("reason") || undefined,
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) {
    return { success: false, message: "Выбери срок паузы." };
  }

  const result = await startSubscriptionPause({ profileId: profile.id, days: parsed.data.days });

  if (result.ok && parsed.data.reason) {
    await recordFeedback({
      profile,
      kind: "cancel",
      channel: "site",
      reason: parsed.data.reason,
      message: parsed.data.message,
      context: { ...(await requestContext("/settings")), outcome: "paused", pauseDays: parsed.data.days },
    });
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: result.ok, message: result.message };
}

export async function resumeSubscriptionAction(
  _prevState: FeedbackActionState,
  _formData: FormData,
): Promise<FeedbackActionState> {
  void _formData;
  const profile = await requireMaster();

  if (!profile || !canManageWorkspace(profile.accountRole)) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const result = await endSubscriptionPause({ profileId: profile.id });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: result.ok, message: result.message };
}
