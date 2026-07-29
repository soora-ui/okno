import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { getSettingsData } from "@/lib/data";
import { canManageWorkspace, isTeamWorkspaceKind } from "@/lib/workspace";

const yookassaOAuthNotices: Record<string, { text: string; tone: "success" | "warning" }> = {
  connected: {
    text: "ЮKassa подключена. Предоплата клиентов теперь идёт напрямую в твой магазин.",
    tone: "success",
  },
  connected_test: {
    text: "Подключен тестовый магазин ЮKassa. Реальные платежи клиентов через него не пройдут — подключи боевой магазин, когда будешь готов принимать предоплату.",
    tone: "warning",
  },
  error: {
    text: "Не получилось подключить ЮKassa. Попробуй еще раз или напиши в поддержку.",
    tone: "warning",
  },
  not_configured: {
    text: "Подключение ЮKassa пока недоступно на платформе.",
    tone: "warning",
  },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string; yookassa?: string }>;
}) {
  const [data, query] = await Promise.all([getSettingsData(), searchParams]);

  if (!data) {
    redirect("/login");
  }

  const {
    availabilityRules,
    profile,
    services,
    serviceManuals,
    referralInvites,
    certificateTemplate,
    yookassaAccount,
    activeSeats,
  } = data;
  const showWorkspaceAdminLink =
    canManageWorkspace(profile.accountRole) &&
    isTeamWorkspaceKind(profile.workspaceKind);
  const showSubscriptionNotice = query.subscription === "processing";
  const yookassaNotice = query.yookassa ? yookassaOAuthNotices[query.yookassa] : undefined;

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge tone="accent">Настройки</Badge>
          <h1 className="text-4xl font-semibold text-ink">Профиль и параметры записи</h1>
        </div>
      </div>

      {showSubscriptionNotice ? (
        <Card className="bg-panel">
          <p className="text-sm font-medium text-ink">Проверяем оплату подписки</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            ЮKassa подтверждает платёж — обычно это занимает несколько секунд. Обнови
            страницу: как только оплата пройдёт, тариф во вкладке «Аккаунт» станет PRO.
          </p>
        </Card>
      ) : null}

      {yookassaNotice ? (
        <Card className={yookassaNotice.tone === "success" ? "bg-success-soft" : "bg-warning-soft"}>
          <p className="text-sm leading-6 text-ink">{yookassaNotice.text}</p>
        </Card>
      ) : null}

      {showWorkspaceAdminLink ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-panel">
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Админка студии вынесена отдельно</p>
            <p className="text-sm leading-6 text-ink-soft">
              Управление сотрудниками и общей командой находится в отдельном разделе, чтобы личный кабинет не смешивался с администрированием.
            </p>
          </div>
          <ButtonLink href="/team" variant="secondary">
            Открыть админку
          </ButtonLink>
        </Card>
      ) : null}

      <SettingsTabs
        profile={profile}
        services={services}
        availabilityRules={availabilityRules}
        serviceManuals={serviceManuals}
        referralInvites={referralInvites}
        certificateTemplate={certificateTemplate}
        yookassaAccount={yookassaAccount}
        activeSeats={activeSeats}
      />
    </div>
  );
}
