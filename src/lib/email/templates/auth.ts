import { legalEntity, supportEmail } from "@/config/legal";
import type { AuthEmailMessage } from "@/lib/auth/email-hook";
import type { EmailTemplate } from "@/lib/email/templates/test";

// Письма входа: подтверждение почты, сброс пароля, смена адреса.
//
// Оформление по брендбуку (брендбук/DESIGN.md): тёплый бумажный фон, белая
// карточка, тёмная кнопка-пилюля, шалфейная плашка; есть тёмная тема. Вёрстка — таблицы и стили
// прямо в тегах: Outlook, Яндекс и Mail.ru не понимают flex, grid и <style>
// снаружи тегов (медиазапросы ниже — только улучшение для Apple Mail и Gmail).
// Manrope подключён ссылкой: где веб-шрифты не грузятся, будет системный.

// Фон белый, а карточка бумажная — наоборот, чем на сайте, ради мобильной
// Яндекс Почты: она не читает тёмную палитру из медиазапроса и перекрашивает
// письмо сама. Замеры по скриншотам (2026-11-12): белый у неё становится
// почти чёрным #18171b, а #faf9f6 — тёплым #221f16, это ближе всего к
// карточке тёмной темы сайта (#181712/#201e18). Тёплые цвета Яндекс сохраняет
// по оттенку, а слишком серые (#f7f6f3 и светлее по насыщенности) уводит в
// свой холодный серый; бумажный #faf7f1 на фоне становился коричневым #292416.
const colors = {
  background: "#ffffff",
  surface: "#faf9f6",
  ink: "#23241f",
  inkSoft: "#434239",
  muted: "#656055",
  line: "#e3d8c7",
  sageSoft: "#eef6f0",
  sageDeep: "#4b6d5b",
};

// Тёмная тема — те же токены, что у сайта (src/app/globals.css, dark).
const darkColors = {
  background: "#181712",
  surface: "#201e18",
  ink: "#f2ede2",
  inkSoft: "#cdc6b8",
  muted: "#9a9384",
  line: "#38352c",
  sageSoft: "#20302a",
  sageDeep: "#a7cdb9",
  buttonBg: "#f2ede2",
  buttonText: "#181712",
};

const font = "Manrope, 'Avenir Next', 'Segoe UI', Arial, Helvetica, sans-serif";

type Copy = {
  subject: string;
  label: string;
  title: string;
  lead: string;
  button: string;
  hint: string;
  note: string;
};

function copyFor(message: AuthEmailMessage): Copy {
  const name = message.name?.trim();

  if (message.kind === "recovery") {
    return {
      subject: "Сброс пароля в okno",
      label: "Сброс пароля",
      title: name ? `${name}, задайте новый пароль` : "Задайте новый пароль",
      lead: "Кто-то, скорее всего вы, попросил сбросить пароль от кабинета okno. Нажмите кнопку — откроется страница, где можно задать новый.",
      button: "Задать новый пароль",
      hint: "Ссылка одноразовая и работает ограниченное время. Если она устарела, запросите сброс ещё раз на странице входа.",
      note: "Если вы не просили сброс — просто удалите письмо, пароль останется прежним.",
    };
  }

  if (message.kind === "email_change") {
    return message.role === "current"
      ? {
          subject: "Смена почты в okno",
          label: "Смена почты",
          title: "Подтвердите смену почты",
          lead: "В кабинете okno меняют адрес для входа с этого на новый. Если это вы — подтвердите.",
          button: "Подтвердить смену",
          hint: "Почта сменится, когда подтверждения придут и со старого адреса, и с нового.",
          note: "Если это не вы — не нажимайте кнопку и смените пароль в настройках кабинета.",
        }
      : {
          subject: "Подтвердите новую почту в okno",
          label: "Новая почта",
          title: "Подтвердите новую почту",
          lead: "Этот адрес указали для входа в кабинет okno. Нажмите кнопку, чтобы подтвердить его.",
          button: "Подтвердить почту",
          hint: "До подтверждения входите по прежнему адресу.",
          note: "Если вы ничего не меняли — просто удалите письмо.",
        };
  }

  return {
    subject: "Подтвердите почту в okno",
    label: "Подтверждение почты",
    title: name ? `${name}, остался один шаг` : "Остался один шаг",
    lead: "Кабинет и страница записи уже созданы. Подтвердите почту — и можно входить и принимать первых клиентов.",
    button: "Подтвердить почту",
    hint: "После подтверждения войдите с паролем, который задали при регистрации.",
    note: "Если вы не регистрировались в okno — просто удалите письмо, аккаунт не активируется.",
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAuthEmail(message: AuthEmailMessage, appUrl: string): EmailTemplate {
  const copy = copyFor(message);
  const base = appUrl.replace(/\/$/, "");
  const link = escapeHtml(message.link);
  const title = escapeHtml(copy.title);
  const markUrl = `${base}/email/okno-mark.png`;
  const offerUrl = `${base}/legal/offer`;
  const d = darkColors;

  // Тёмная тема: Apple Mail, iOS, Gmail-приложения и Outlook.com берут цвета из
  // медиазапроса (Outlook.com — по атрибутам data-ogsc/data-ogsb). Остальные
  // перекрашивают письмо сами — на этот случай знак с окантовкой, а «okno» в
  // шапке живым текстом: его клиент перекрасит вместе с остальным.
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${copy.subject}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (max-width: 620px) {
    .card { border-radius: 20px !important; }
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .title { font-size: 32px !important; line-height: 38px !important; }
    .button a { display: block !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background-color: ${d.background} !important; }
    .card { background-color: ${d.surface} !important; border-color: ${d.line} !important; }
    .ink { color: ${d.ink} !important; }
    .soft { color: ${d.inkSoft} !important; }
    .muted, .muted a { color: ${d.muted} !important; }
    .label { color: ${d.sageDeep} !important; }
    .hint { background-color: ${d.sageSoft} !important; color: ${d.sageDeep} !important; }
    .rule { background-color: ${d.line} !important; }
    .btn { background-color: ${d.buttonBg} !important; }
    .btn a { color: ${d.buttonText} !important; }
    .link { color: ${d.inkSoft} !important; }
  }
  [data-ogsb] .bg { background-color: ${d.background} !important; }
  [data-ogsb] .card { background-color: ${d.surface} !important; }
  [data-ogsc] .ink { color: ${d.ink} !important; }
  [data-ogsc] .soft, [data-ogsc] .link { color: ${d.inkSoft} !important; }
  [data-ogsc] .muted { color: ${d.muted} !important; }
  [data-ogsc] .label { color: ${d.sageDeep} !important; }
  [data-ogsb] .hint { background-color: ${d.sageSoft} !important; }
  [data-ogsc] .hint { color: ${d.sageDeep} !important; }
  [data-ogsb] .btn { background-color: ${d.buttonBg} !important; }
  [data-ogsc] .btn a { color: ${d.buttonText} !important; }
</style>
</head>
<body class="bg" style="margin:0; padding:0; background-color:${colors.background};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; font-size:1px; line-height:1px;">${copy.lead}</div>
<table class="bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${colors.background};">
  <tr>
    <td class="bg" align="center" style="padding:40px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%;">
        <tr>
          <td style="padding:0 8px 24px 8px;">
            <a href="${base}" style="text-decoration:none;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;"><img src="${markUrl}" width="32" height="32" alt="" style="display:block; border:0; width:32px; height:32px;"></td>
                  <td class="ink" style="vertical-align:middle; padding-left:10px; font-family:${font}; font-size:26px; line-height:32px; font-weight:700; letter-spacing:-0.4px; color:${colors.ink};">okno</td>
                </tr>
              </table>
            </a>
          </td>
        </tr>
        <tr>
          <td class="card" style="background-color:${colors.surface}; border:1px solid ${colors.line}; border-radius:28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="pad label" style="padding:40px 40px 0 40px; font-family:${font}; font-size:15px; line-height:18px; letter-spacing:2px; text-transform:uppercase; color:${colors.sageDeep}; font-weight:600;">
                  ${copy.label}
                </td>
              </tr>
              <tr>
                <td class="pad title ink" style="padding:12px 40px 0 40px; font-family:${font}; font-size:36px; line-height:42px; letter-spacing:-0.7px; color:${colors.ink}; font-weight:600;">
                  ${title}
                </td>
              </tr>
              <tr>
                <td class="pad soft" style="padding:16px 40px 0 40px; font-family:${font}; font-size:20px; line-height:31px; color:${colors.inkSoft};">
                  ${copy.lead}
                </td>
              </tr>
              <tr>
                <td class="pad button" style="padding:32px 40px 0 40px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td class="btn" align="center" style="border-radius:999px; background-color:${colors.ink};">
                        <a href="${link}" style="display:inline-block; padding:18px 38px; font-family:${font}; font-size:20px; line-height:24px; color:#ffffff; text-decoration:none; font-weight:600; border-radius:999px;">${copy.button}&nbsp;&nbsp;&rarr;</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="pad" style="padding:32px 40px 0 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td class="hint" style="background-color:${colors.sageSoft}; border-radius:16px; padding:16px 20px; font-family:${font}; font-size:18px; line-height:27px; color:${colors.sageDeep};">
                        ${copy.hint}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="pad muted" style="padding:24px 40px 0 40px; font-family:${font}; font-size:17px; line-height:25px; color:${colors.muted};">
                  Кнопка не нажимается? Скопируйте ссылку в браузер:<br>
                  <a class="link" href="${link}" style="color:${colors.inkSoft}; word-break:break-all;">${link}</a>
                </td>
              </tr>
              <tr>
                <td class="pad" style="padding:24px 40px 40px 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr><td class="rule" style="height:1px; background-color:${colors.line}; font-size:0; line-height:0;">&nbsp;</td></tr>
                    <tr>
                      <td class="muted" style="padding-top:20px; font-family:${font}; font-size:17px; line-height:25px; color:${colors.muted};">
                        ${copy.note}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="muted" style="padding:24px 8px 0 8px; font-family:${font}; font-size:16px; line-height:24px; color:${colors.muted};">
            okno — онлайн-запись для мастеров и студий.<br>
            ${legalEntity.name} · <a href="${offerUrl}" style="color:${colors.muted};">Публичная оферта</a><br>
            Вопросы — <a href="mailto:${supportEmail}" style="color:${colors.muted};">${supportEmail}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const plaintext = [
    "okno",
    "",
    copy.title,
    "",
    copy.lead,
    "",
    `${copy.button}: ${message.link}`,
    "",
    copy.hint,
    "",
    copy.note,
    "",
    "---",
    `${legalEntity.name}`,
    `Публичная оферта: ${offerUrl}`,
    `Вопросы: ${supportEmail}`,
  ].join("\n");

  return { subject: copy.subject, html, plaintext };
}
