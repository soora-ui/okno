import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { env } from "@/lib/env";

// QR-верификация подарочного сертификата (okno-tz-certificates.md, 3.3).
// Токен генерируется криптографически случайным (randomBytes, не
// Math.random — тот же принцип, что и у кода сертификата в
// gift-certificates.ts), в БД хранится только его SHA-256 хэш. Сырой
// токен нигде не сохраняется — он существует только в URL: один раз в
// returnUrl ЮKassa (для скачивания PDF покупателем) и в самом QR-коде на
// сертификате (для последующей верификации мастером). Это один и тот же
// токен для обоих сценариев — см. план по сертификатам.

// Сторона QR-зоны на печатном макете (мм) — используется и в промпте
// генерации шаблона, и как ориентир при рендере, чтобы обе части
// согласовывались с минимальным размером из ТЗ (20х20 мм).
export const certificateQrBoxSizeMm = 25;

// Тот же размер в пикселях холста (A5 150dpi, см. certificateDimensions в
// certificates/render.ts — размеры продублированы числом, чтобы этот модуль
// не зависел от рендер-пайплайна и оставался пригодным на клиенте).
export const certificateQrSizePx = Math.round((certificateQrBoxSizeMm / 210) * 1240);

export function generateCertificateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashCertificateToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildCertificateVerifyUrl(input: {
  certificateId: string;
  token: string;
}): string {
  return `${env.appUrl}/verify/${input.certificateId}?t=${input.token}`;
}

// width обязателен: без него qrcode отдаёт <svg> только с viewBox (в
// единицах модулей, ~31), и satori принимает эти единицы за реальный размер
// — QR получается размером с ноготь внутри своей зоны. Явные width/height
// в атрибутах SVG — единственный надёжный способ задать размер, satori не
// умеет масштабировать вложенный SVG под контейнер.
export async function generateCertificateQrSvg(
  url: string,
  sizePx: number = certificateQrSizePx,
): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: sizePx,
  });
}
