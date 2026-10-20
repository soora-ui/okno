import { readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { PDFDocument } from "pdf-lib";
import satori from "satori";
import { html as parseHtml } from "satori-html";
import { generateCertificateQrSvg } from "@/lib/certificate-verification";

// Рендер финального сертификата (okno-tz-certificates.md, 3.2) — без ИИ,
// обычная подстановка данных в сохранённый шаблон мастера. Стек выбран под
// небольшой VPS (без Chromium/Puppeteer): satori (HTML-подмножество → SVG,
// только флексбокс — то же ограничение естественно не даёт Claude
// сгенерировать шаблон с произвольным CSS, ломающим пропорции A5) →
// @resvg/resvg-js (SVG → PNG, без браузера) → pdf-lib (PNG → PDF
// фиксированного размера A5). Все функции здесь чистые — не обращаются к
// Supabase/Next, что упрощает отладку рендер-пайплайна.

// A5 альбомная ориентация, единый источник размеров для промпта генерации,
// рендера и итогового PDF.
export const certificateDimensions = {
  widthMm: 210,
  heightMm: 148,
  widthPx150dpi: 1240,
  heightPx150dpi: 874,
  widthPx300dpi: 2480,
  heightPx300dpi: 1748,
  widthPt: 595.28,
  heightPt: 419.53,
} as const;

export type CertificatePlaceholderData = {
  amount: string;
  certNumber: string;
  issueDate: string;
  expiryDate: string;
  qrCodeSvg: string;
};

// {{amount}} подставляется БЕЗ символа валюты: знак ₽ рисует сам шаблон
// (так требует промпт генерации). Иначе на макете оказывается два рубля —
// наш из подстановки и свой у шаблона.
export function formatCertificateAmount(amountRub: number): string {
  return amountRub.toLocaleString("ru-RU");
}

const fontsDir = path.join(process.cwd(), "src/lib/certificates/fonts");

let cachedFonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | null = null;

function loadFonts() {
  if (!cachedFonts) {
    cachedFonts = [
      {
        name: "PT Sans",
        data: readFileSync(path.join(fontsDir, "PT-Sans-Regular.ttf")),
        weight: 400,
        style: "normal",
      },
      {
        name: "PT Sans",
        data: readFileSync(path.join(fontsDir, "PT-Sans-Bold.ttf")),
        weight: 700,
        style: "normal",
      },
    ];
  }
  return cachedFonts;
}

// Обычная строковая замена — 5 фиксированных плейсхолдеров, шаблонизатор
// для этого не нужен (см. ТЗ 3.2).
export function substitutePlaceholders(
  htmlSource: string,
  data: CertificatePlaceholderData,
): string {
  return htmlSource
    .replaceAll("{{amount}}", data.amount)
    .replaceAll("{{certNumber}}", data.certNumber)
    .replaceAll("{{issueDate}}", data.issueDate)
    .replaceAll("{{expiryDate}}", data.expiryDate)
    .replaceAll("{{qrCodeSvg}}", data.qrCodeSvg);
}

// Может бросить исключение, если html вне satori-совместимого подмножества
// (например, position/grid) — вызывающий код (генерация шаблона) должен
// поймать это как сигнал "шаблон невалиден", а не как внутреннюю ошибку.
export async function renderCertificateToSvg(html: string): Promise<string> {
  const tree = parseHtml(html);
  // satori-html возвращает свой VNode, не React.ReactNode — структурно
  // это ровно то, что satori ожидает на входе (тот же паттерн, что в
  // официальных примерах satori-html), но типы двух пакетов не совпадают.
  return satori(tree as unknown as Parameters<typeof satori>[0], {
    width: certificateDimensions.widthPx150dpi,
    height: certificateDimensions.heightPx150dpi,
    fonts: loadFonts(),
  });
}

export function renderCertificateToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: certificateDimensions.widthPx150dpi },
  });
  return Buffer.from(resvg.render().asPng());
}

// Заглушка данных для мест, где нужен рендер шаблона без реального
// сертификата: пробный рендер при генерации (проверка на
// satori-совместимость) и превью-миниатюра на странице настроек.
export const certificateThumbnailPlaceholderData: CertificatePlaceholderData = {
  amount: formatCertificateAmount(1000),
  certNumber: "OKNO-0000-0000-0000",
  issueDate: "1 января 2026",
  expiryDate: "бессрочно",
  qrCodeSvg: "<svg></svg>",
};

export async function renderCertificateThumbnailPng(htmlSource: string): Promise<Buffer> {
  const substituted = substitutePlaceholders(htmlSource, certificateThumbnailPlaceholderData);
  const svg = await renderCertificateToSvg(substituted);
  return renderCertificateToPng(svg);
}

export async function renderCertificateToPdf(png: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([certificateDimensions.widthPt, certificateDimensions.heightPt]);
  const embeddedPng = await pdfDoc.embedPng(png);
  page.drawImage(embeddedPng, {
    x: 0,
    y: 0,
    width: certificateDimensions.widthPt,
    height: certificateDimensions.heightPt,
  });
  return Buffer.from(await pdfDoc.save());
}

export type RenderCertificateInput = {
  htmlSource: string;
  amount: string;
  certNumber: string;
  issueDate: string;
  expiryDate: string;
  verifyUrl: string;
};

export async function renderCertificate(
  input: RenderCertificateInput,
): Promise<{ png: Buffer; pdf: Buffer }> {
  const qrCodeSvg = await generateCertificateQrSvg(input.verifyUrl);
  const substituted = substitutePlaceholders(input.htmlSource, {
    amount: input.amount,
    certNumber: input.certNumber,
    issueDate: input.issueDate,
    expiryDate: input.expiryDate,
    qrCodeSvg,
  });
  const svg = await renderCertificateToSvg(substituted);
  const png = renderCertificateToPng(svg);
  const pdf = await renderCertificateToPdf(png);
  return { png, pdf };
}
