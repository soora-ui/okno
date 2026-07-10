import { randomInt } from "node:crypto";

// Реферальная программа мастеров: за каждого приглашённого, который оплатил
// первый месяц PRO, пригласивший получает +30 дней PRO. Начисление делает
// вебхук ЮKassa (см. src/app/api/payments/yookassa/webhook/route.ts и
// src/lib/referral-rewards.ts), продлевая subscription_until той же логикой,
// что и обычная оплата.
//
// Этот файл импортируется и клиентскими компонентами (реферальный блок в
// настройках), поэтому здесь только чистые функции и типы — без Supabase
// admin-клиента и серверных модулей логирования.

export const referralBonusDays = 30;

// Код без похожих по написанию символов (0/O, 1/I/L и т.п.), чтобы его было
// легко продиктовать или напечатать без ошибок.
const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERRAL_CODE_LENGTH = 7;

// Криптографически случайный код. randomInt — CSPRNG (node:crypto), поэтому
// код нельзя предсказать по времени/номеру регистрации.
export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

// Код принимается из ?ref=CODE — нормализуем перед сравнением с БД
// (регистр, случайные пробелы при копировании ссылки).
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed || trimmed.length > 16) return null;
  return trimmed;
}

export function buildReferralLink(appUrl: string, referralCode: string): string {
  return `${appUrl}/register?ref=${encodeURIComponent(referralCode)}`;
}

export type ReferralInviteStatus = "pending" | "applied";

export type ReferralInviteSummary = {
  id: string;
  referredProfileId: string;
  referredName: string;
  status: ReferralInviteStatus;
  createdAt: string;
  appliedAt: string | null;
};
