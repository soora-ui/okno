"use client";

import { useState } from "react";
import { Check, Copy, Gift, Users2 } from "lucide-react";
import { referralBonusDays, type ReferralInviteSummary } from "@/lib/referral";
import { formatSubscriptionUntil } from "@/lib/subscription";

const inviteStatusLabels: Record<ReferralInviteSummary["status"], string> = {
  pending: "Ждём первую оплату",
  applied: "Бонус начислен",
};

export function ReferralSettings({
  referralLink,
  referralCode,
  invites,
}: {
  referralLink: string | null;
  referralCode: string | null;
  invites: ReferralInviteSummary[];
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена может быть недоступен (например, без HTTPS) — молча
      // игнорируем, ссылку всегда можно скопировать вручную из поля.
    }
  }

  if (!referralCode || !referralLink) {
    return (
      <p className="text-sm leading-6 text-ink-soft">
        Реферальная ссылка появится после обновления базы данных. Обратись к
        поддержке, если это сообщение не пропадает долго.
      </p>
    );
  }

  const appliedCount = invites.filter((invite) => invite.status === "applied").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-panel bg-panel px-4 py-3">
        <Gift size={18} className="shrink-0 text-accent-deep" />
        <p className="text-sm leading-6 text-ink-soft">
          Приглашай других мастеров: за каждого, кто оплатит первый месяц подписки,
          ты получишь <strong>+{referralBonusDays} дней PRO</strong> бесплатно.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-panel border border-line bg-surface px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {referralLink}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:border-ink-soft"
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          {copied ? "Скопировано" : "Скопировать"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Users2 size={16} className="text-muted" />
        <p className="text-xs text-muted">
          Приглашено: {invites.length}
          {invites.length > 0 ? ` · Начислено бонусов: ${appliedCount}` : ""}
        </p>
      </div>

      {invites.length > 0 ? (
        <div className="overflow-hidden rounded-panel border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Мастер</th>
                <th className="px-4 py-3 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-t border-line">
                  <td className="px-4 py-3 text-ink">
                    {invite.referredName || "Без имени"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        invite.status === "applied"
                          ? "bg-success-soft text-success"
                          : "bg-surface text-muted"
                      }`}
                    >
                      {inviteStatusLabels[invite.status]}
                      {invite.status === "applied" && invite.appliedAt
                        ? ` · ${formatSubscriptionUntil(invite.appliedAt)}`
                        : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm leading-6 text-ink-soft">
          Пока никто не зарегистрировался по твоей ссылке.
        </p>
      )}
    </div>
  );
}
