import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  giftCertificateMaxAmount,
  giftCertificateMinAmount,
} from "@/lib/booking-page-settings";

// Подарочные сертификаты: клиент покупает сертификат на публичной странице
// мастера, оплата — через ЮKassa (см. src/lib/payments/yookassa.ts и
// src/app/api/payments/yookassa/webhook/route.ts). Код доставляется клиенту
// через существующую очередь уведомлений (см. src/lib/notification-queue.ts).
//
// Настройки продажи (вкл/выкл, номиналы) живут в profiles.booking_page_settings
// (см. src/lib/booking-page-settings.ts) — этот файл отвечает только за сам
// сертификат: генерацию кода, схемы валидации, статусную машину.

export type GiftCertificateStatus =
  | "pending"
  | "paid"
  | "active"
  | "redeemed"
  | "expired"
  | "canceled";

export type GiftCertificate = {
  id: string;
  profileId: string;
  code: string;
  amount: number;
  serviceId: string | null;
  status: GiftCertificateStatus;
  purchaserContact: string;
  provider: string;
  providerPaymentId: string | null;
  redeemedAt: string | null;
  redeemedBookingId: string | null;
  expiresAt: string | null;
  createdAt: string;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без 0/O/1/I — легче диктовать
const CODE_SEGMENT_LENGTH = 4;
const CODE_SEGMENTS = 3;

// Криптографически случайный, человекочитаемый код вида "OKNO-7F3K-Q9ZP-2MXT".
// Используем randomBytes (не Math.random) — код нельзя предсказать или
// перебрать за разумное время.
export function generateGiftCertificateCode(): string {
  const segments = Array.from({ length: CODE_SEGMENTS }, () => {
    const bytes = randomBytes(CODE_SEGMENT_LENGTH);
    let segment = "";
    for (let i = 0; i < CODE_SEGMENT_LENGTH; i += 1) {
      segment += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return segment;
  });

  return ["OKNO", ...segments].join("-");
}

export function normalizeCertificateCodeInput(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

export const giftCertificatePurchaseSchema = z.object({
  username: z.string().trim().min(1),
  amount: z.coerce.number().int().min(giftCertificateMinAmount).max(giftCertificateMaxAmount),
  serviceId: z.string().optional().default(""),
  // Обязательная почта: у покупателя нет аккаунта, и ссылка на скачивание
  // живёт только в адресной строке после оплаты. Если вкладку закрыть,
  // восстановить сертификат больше нечем — почта это страхует.
  purchaserEmail: z
    .string()
    .trim()
    .min(1, "Укажи почту")
    .email("Проверь адрес почты")
    .max(160),
  // Телефон остаётся необязательным — только для связи на случай спора.
  purchaserContact: z.string().trim().max(120).optional().default(""),
});

export const redeemCertificateCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .transform(normalizeCertificateCodeInput),
});

export function isCertificateRedeemable(input: {
  status: GiftCertificateStatus;
  expiresAt: string | null;
}): boolean {
  if (input.status !== "active") {
    return false;
  }

  if (!input.expiresAt) {
    return true;
  }

  return new Date(input.expiresAt).getTime() > Date.now();
}

export function isCertificateApplicableToService(input: {
  certificateServiceId: string | null;
  requestedServiceId: string;
}): boolean {
  if (!input.certificateServiceId) {
    return true; // сертификат «на любую услугу»
  }

  return input.certificateServiceId === input.requestedServiceId;
}
