"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env, isSupabaseConfigured, isSupportAssistantConfigured } from "@/lib/env";
import { getCurrentAuthProfile } from "@/lib/data";
import {
  buildCertificateTemplateRepairPrompt,
  buildCertificateTemplateUserPrompt,
  certificateTemplateSystemPrompt,
  findMissingCertificatePlaceholders,
  pickCertificateDesignArchetypes,
} from "@/lib/certificates/generation-prompt";
import { maxCertificateTemplateRegenerations } from "@/lib/certificates/limits";
import {
  certificateThumbnailPlaceholderData,
  formatCertificateAmount,
  renderCertificate,
  renderCertificateToSvg,
  substitutePlaceholders,
} from "@/lib/certificates/render";
import { isOwnedProfileMediaPath, resolveProfileMediaUrl } from "@/lib/profile-media";
import { writeAuditLog } from "@/lib/observability/audit";
import { logError } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Дизайн шаблона сертификата (okno-tz-certificates.md, 2.1/3.1). Генерация
// через Claude API происходит только на этом шаге, не при каждой выдаче
// сертификата. Жёсткий потолок — 3 регенерации на аккаунт мастера,
// счётчик хранится на самой строке certificate_templates (одна строка на
// мастера, регенерация — это UPDATE, поэтому счётчик переживает
// перегенерации). Ручное редактирование сгенерированного HTML не
// предусмотрено — только повторная генерация с новыми исходными данными.

const testPreviewAmount = 1000;

export type CertificateTemplateActionState = {
  success: boolean;
  message: string;
  previewPngBase64?: string;
  regenerationCount?: number;
};

const templateInputSchema = z.object({
  logoPath: z.string().trim().optional().default(""),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Некорректный формат цвета"),
  secondaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Некорректный формат цвета"),
  studioName: z.string().trim().max(80).optional().default(""),
  tagline: z.string().trim().max(160).optional().default(""),
  contacts: z.string().trim().max(160).optional().default(""),
});

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return anthropicClient;
}

async function requireProfile() {
  if (!isSupabaseConfigured) return null;
  const authProfile = await getCurrentAuthProfile();
  return authProfile?.profile ?? null;
}

function extractHtmlFromResponse(response: Anthropic.Messages.Message): string | null {
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    return null;
  }
  // На случай, если модель все же обернула ответ в markdown-код блок.
  return textBlock.text.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
}

// Пробный рендер тестовыми данными — единственный способ узнать, что
// сгенерированный HTML действительно укладывается в satori-совместимое
// подмножество (см. certificates/generation-prompt.ts), а не просто
// содержит все плейсхолдеры.
async function tryCompileTemplate(html: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await renderCertificateToSvg(substitutePlaceholders(html, certificateThumbnailPlaceholderData));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function generateCertificateTemplateAction(
  _prevState: CertificateTemplateActionState,
  formData: FormData,
): Promise<CertificateTemplateActionState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Нужно подключение к Supabase." };
  }

  if (!isSupportAssistantConfigured) {
    return { success: false, message: "Генерация дизайна пока недоступна: не настроен ANTHROPIC_API_KEY." };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = templateInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Проверь цвета — они должны быть в формате #RRGGBB." };
  }

  if (parsed.data.logoPath && !isOwnedProfileMediaPath(parsed.data.logoPath, profile.passwordAuthId, "certificate-logo")) {
    return { success: false, message: "Путь логотипа не принадлежит текущему пользователю." };
  }

  const admin = createSupabaseAdminClient();
  const { data: existingTemplate, error: existingError } = await admin
    .from("certificate_templates")
    .select("id, regeneration_count")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingError) {
    logError("Failed to load certificate template row", { profileId: profile.id, error: existingError });
    return { success: false, message: "Не получилось проверить текущий шаблон." };
  }

  const currentCount = Number(existingTemplate?.regeneration_count ?? 0);
  const isRegeneration = Boolean(existingTemplate);

  if (isRegeneration && currentCount >= maxCertificateTemplateRegenerations) {
    return {
      success: false,
      message: `Лимит перегенераций исчерпан (${maxCertificateTemplateRegenerations} из ${maxCertificateTemplateRegenerations}).`,
      regenerationCount: currentCount,
    };
  }

  const logoUrl = parsed.data.logoPath ? resolveProfileMediaUrl(parsed.data.logoPath) : null;
  // Архетип композиции и настроения выбирается от мастера и номера попытки:
  // каждая перегенерация обязана дать заведомо другой макет, а не тот же
  // центрированный вариант с переставленными блоками.
  const { layout, vibe } = pickCertificateDesignArchetypes({
    profileId: profile.id,
    attemptIndex: currentCount,
  });
  const userPrompt = buildCertificateTemplateUserPrompt({
    logoUrl,
    primaryColor: parsed.data.primaryColor,
    secondaryColor: parsed.data.secondaryColor,
    studioName: parsed.data.studioName,
    tagline: parsed.data.tagline,
    contacts: parsed.data.contacts,
    layoutBrief: layout.brief,
    vibeBrief: vibe.brief,
  });

  const client = getAnthropicClient();
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: userPrompt }];

  let html: string | null = null;
  let lastError = "";

  // Один пробный рендер + при неудаче один автоматический повторный
  // запрос с текстом ошибки. Это не считается регенерацией из лимита в 3 —
  // лимит про осознанные повторные нажатия кнопки, а не про починку
  // модели самой себя.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Anthropic.Messages.Message;
    try {
      response = await client.messages.create({
        // Opus, а не Sonnet: это разовая генерация (максимум 4 вызова на
        // аккаунт мастера за всё время), но её результат мастер потом
        // печатает и отдаёт клиентам — качество композиции важнее цены
        // вызова, и на арт-директорских задачах разрыв между моделями
        // заметен.
        model: "claude-opus-4-8",
        max_tokens: 8192,
        system: certificateTemplateSystemPrompt,
        messages,
      });
    } catch (error) {
      logError("Certificate template generation request failed", { profileId: profile.id, error });
      return { success: false, message: "Не получилось связаться с Claude API. Попробуй еще раз." };
    }

    if (response.stop_reason === "refusal") {
      return { success: false, message: "Не получилось сгенерировать этот вариант. Попробуй изменить формулировки (название/слоган)." };
    }

    const candidate = extractHtmlFromResponse(response);
    if (!candidate) {
      return { success: false, message: "Пустой ответ от Claude API. Попробуй еще раз." };
    }

    const missingPlaceholders = findMissingCertificatePlaceholders(candidate);
    if (missingPlaceholders.length > 0) {
      lastError = `Отсутствуют обязательные плейсхолдеры: ${missingPlaceholders.join(", ")}`;
      messages.push({ role: "assistant", content: candidate });
      messages.push({ role: "user", content: buildCertificateTemplateRepairPrompt(lastError) });
      continue;
    }

    const compileResult = await tryCompileTemplate(candidate);
    if (compileResult.ok) {
      html = candidate;
      break;
    }

    lastError = compileResult.error;
    messages.push({ role: "assistant", content: candidate });
    messages.push({ role: "user", content: buildCertificateTemplateRepairPrompt(lastError) });
  }

  if (!html) {
    logError("Certificate template failed to compile after retry", { profileId: profile.id, error: lastError });
    return { success: false, message: "Не получилось собрать корректный шаблон. Попробуй еще раз с другими настройками." };
  }

  const nextCount = isRegeneration ? currentCount + 1 : currentCount;
  const { data: savedTemplate, error: saveError } = await admin
    .from("certificate_templates")
    .upsert(
      {
        profile_id: profile.id,
        html_source: html,
        primary_color: parsed.data.primaryColor,
        secondary_color: parsed.data.secondaryColor,
        logo_path: parsed.data.logoPath || null,
        studio_name: parsed.data.studioName,
        tagline: parsed.data.tagline,
        contacts: parsed.data.contacts,
        regeneration_count: nextCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    )
    .select("id")
    .single();

  if (saveError || !savedTemplate) {
    logError("Failed to save certificate template", { profileId: profile.id, error: saveError });
    return { success: false, message: "Не получилось сохранить шаблон." };
  }

  const preview = await renderCertificate({
    htmlSource: html,
    amount: formatCertificateAmount(testPreviewAmount),
    certNumber: "OKNO-TEST-0000-0000",
    issueDate: "1 января 2026",
    expiryDate: "бессрочно",
    verifyUrl: `${env.appUrl}/verify/preview`,
  });

  await writeAuditLog({
    actorKind: "master",
    actorProfileId: profile.id,
    profileId: profile.id,
    workspaceId: profile.workspaceId,
    eventType: "certificate_template.generated",
    targetType: "certificate_template",
    targetId: savedTemplate.id,
    metadata: { regenerationCount: nextCount, isRegeneration },
  });

  return {
    success: true,
    message: isRegeneration ? "Шаблон перегенерирован." : "Шаблон сгенерирован.",
    previewPngBase64: preview.png.toString("base64"),
    regenerationCount: nextCount,
  };
}

const previewInputSchema = z.object({
  testAmount: z.coerce.number().int().min(1),
});

export async function previewCertificateTemplateAction(
  _prevState: CertificateTemplateActionState,
  formData: FormData,
): Promise<CertificateTemplateActionState> {
  if (!isSupabaseConfigured) {
    return { success: false, message: "Нужно подключение к Supabase." };
  }

  const profile = await requireProfile();
  if (!profile) {
    return { success: false, message: "Сессия истекла. Войди заново." };
  }

  const parsed = previewInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Некорректная тестовая сумма." };
  }

  const admin = createSupabaseAdminClient();
  const { data: templateRow, error } = await admin
    .from("certificate_templates")
    .select("html_source, regeneration_count")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (error || !templateRow) {
    return { success: false, message: "Шаблон еще не сгенерирован." };
  }

  const preview = await renderCertificate({
    htmlSource: templateRow.html_source,
    amount: formatCertificateAmount(parsed.data.testAmount),
    certNumber: "OKNO-TEST-0000-0000",
    issueDate: "1 января 2026",
    expiryDate: "бессрочно",
    verifyUrl: `${env.appUrl}/verify/preview`,
  });

  return {
    success: true,
    message: "Превью обновлено.",
    previewPngBase64: preview.png.toString("base64"),
    regenerationCount: Number(templateRow.regeneration_count ?? 0),
  };
}
