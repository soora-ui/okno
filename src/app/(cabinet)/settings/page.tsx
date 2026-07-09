import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { getSettingsData } from "@/lib/data";
import { canManageWorkspace, isTeamWorkspaceKind } from "@/lib/workspace";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string }>;
}) {
  const [data, query] = await Promise.all([getSettingsData(), searchParams]);

  if (!data) {
    redirect("/login");
  }

  const { availabilityRules, profile, services, serviceManuals } = data;
  const showWorkspaceAdminLink =
    canManageWorkspace(profile.accountRole) &&
    isTeamWorkspaceKind(profile.workspaceKind);
  const showSubscriptionNotice = query.subscription === "processing";

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
      />
    </div>
  );
}
