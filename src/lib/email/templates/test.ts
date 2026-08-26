import { DateTime } from "luxon";
import { legalEntity, supportEmail } from "@/config/legal";
import { env } from "@/lib/env";

// Тестовое письмо для проверки интеграции. Вёрстка табличная и со стилями
// внутри тегов: Outlook и Mail.ru не понимают flex, grid и внешние стили, а
// проверять надо именно то, как письмо выглядит у почтовиков, а не в браузере.

export type EmailTemplate = {
  subject: string;
  html: string;
  plaintext: string;
};

export function buildTestEmail(): EmailTemplate {
  const appUrl = env.appUrl.replace(/\/$/, "");
  const sentAt = DateTime.now()
    .setZone("Europe/Moscow")
    .setLocale("ru")
    .toFormat("d LLLL yyyy, HH:mm");
  const offerUrl = `${appUrl}/legal/offer`;
  const siteUrl = "https://okno.business";

  const subject = "Проверка отправки писем okno.business";
  const preheader = `Служебное письмо, отправлено ${sentAt} МСК.`;

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f2ee;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; font-size:1px; line-height:1px;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f2ee;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:100%; background-color:#ffffff; border-radius:12px;">
        <tr>
          <td style="padding:28px 32px 8px 32px; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:24px; color:#1c1a17; font-weight:bold;">
            okno.business
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px; font-family:Arial, Helvetica, sans-serif; font-size:24px; line-height:32px; color:#1c1a17;">
            Тестовое письмо
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:22px; color:#4a453e;">
            Если вы видите это письмо — интеграция Unisender Go работает.
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 0 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:22px; color:#4a453e;">
            Отправлено: ${sentAt} МСК.
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:22px; color:#4a453e;">
            <a href="${siteUrl}" style="color:#1c1a17;">Открыть okno.business</a>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:1px; background-color:#e7e2d9; font-size:0; line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px 32px; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#8a8378;">
            ${legalEntity.name}<br>
            <a href="${offerUrl}" style="color:#8a8378;">Публичная оферта</a><br>
            <a href="mailto:${supportEmail}" style="color:#8a8378;">${supportEmail}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const plaintext = [
    "okno.business",
    "",
    "Тестовое письмо",
    "",
    "Если вы видите это письмо — интеграция Unisender Go работает.",
    `Отправлено: ${sentAt} МСК.`,
    "",
    siteUrl,
    "",
    "---",
    legalEntity.name,
    `Публичная оферта: ${offerUrl}`,
    supportEmail,
  ].join("\n");

  return { subject, html, plaintext };
}
