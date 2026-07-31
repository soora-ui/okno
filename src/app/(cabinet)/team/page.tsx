import { redirect } from "next/navigation";
import { CalendarClock, ShieldCheck, Users2, Wallet } from "lucide-react";
import {
  CreateTeamMemberForm,
  TeamMemberCard,
  WorkspaceSettingsForm,
} from "@/components/team/team-forms";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveCityValue } from "@/lib/cities";
import { getTeamDashboardData } from "@/lib/data";

export default async function TeamPage() {
  const data = await getTeamDashboardData();

  if (!data) {
    redirect("/dashboard");
  }

  const { members, profile, recentClients, upcomingBookings, workspace } = data;

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge tone="accent">Администрирование</Badge>
          <h1 className="text-4xl font-semibold text-ink">
            {workspace.name}
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-ink-soft">
            Здесь администратор видит команду, ближайшие записи и клиентскую
            базу по каждому сотруднику. Личные кабинеты сотрудников при этом
            остаются изолированными.
          </p>
        </div>
        <ButtonLink href="/dashboard" variant="secondary">
          Открыть личный кабинет
        </ButtonLink>
      </div>

      <div className="print-grid-2 grid gap-4 md:auto-rows-fr md:grid-cols-4">
        <Card className="print-avoid-break print-no-shadow space-y-2">
          <Users2 className="text-accent-deep" size={22} />
          <p className="text-sm text-muted">Сотрудники</p>
          <p className="text-3xl font-semibold text-ink">{workspace.memberCount}</p>
          <p className="text-sm text-ink-soft">
            {workspace.activeMemberCount} активны, {workspace.disabledMemberCount} отключены.
          </p>
        </Card>
        <Card className="print-avoid-break print-no-shadow space-y-2">
          <CalendarClock className="text-warning" size={22} />
          <p className="text-sm text-muted">Записи сегодня</p>
          <p className="text-3xl font-semibold text-ink">
            {workspace.bookingsTodayCount}
          </p>
          <p className="text-sm text-ink-soft">
            Всего впереди {workspace.upcomingBookingsCount} подтвержденных визитов.
          </p>
        </Card>
        <Card className="print-avoid-break print-no-shadow space-y-2">
          <Wallet className="text-success" size={22} />
          <p className="text-sm text-muted">Клиентская база</p>
          <p className="text-3xl font-semibold text-ink">{workspace.clientCount}</p>
          <p className="text-sm text-ink-soft">
            Все клиенты распределены по личным кабинетам сотрудников.
          </p>
        </Card>
        <Card className="print-avoid-break print-no-shadow space-y-2">
          <ShieldCheck className="text-ink" size={22} />
          <p className="text-sm text-muted">Формат</p>
          <p className="text-2xl font-semibold text-ink">{workspace.kindLabel}</p>
          <p className="text-sm text-ink-soft">
            Админка отделена от рабочих кабинетов мастеров.
          </p>
        </Card>
      </div>

      <div className="print-stack-cols grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card className="print-avoid-break print-no-shadow space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-ink">Ближайшие записи команды</h2>
                <p className="text-sm text-muted">
                  Общая лента визитов по всем сотрудникам студии.
                </p>
              </div>
            </div>
            {upcomingBookings.length > 0 ? (
              <div className="space-y-3">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-nested border border-line bg-panel px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">
                          {booking.clientName} · {booking.serviceTitle}
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">
                          {booking.memberName} · {booking.startsAtLabel}
                        </p>
                      </div>
                      <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft">
                        {booking.sourceLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Ближайших записей пока нет"
                description="Как только сотрудники начнут принимать записи, администратор увидит их здесь."
                ctaLabel="Открыть личный кабинет"
                ctaHref="/dashboard"
              />
            )}
          </Card>

          <Card className="print-avoid-break print-no-shadow space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Клиенты команды</h2>
              <p className="text-sm text-muted">
                Последние клиенты по всем сотрудникам с привязкой к их кабинету.
              </p>
            </div>
            {recentClients.length > 0 ? (
              <div className="space-y-3">
                {recentClients.map((client) => (
                  <div
                    key={client.id}
                    className="rounded-nested border border-line px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">
                          {client.name} · {client.phoneMasked}
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">
                          {client.memberName} · последний визит {client.lastVisitLabel}
                        </p>
                      </div>
                    </div>
                    {client.notes ? (
                      <p className="mt-3 text-sm leading-6 text-ink-soft">
                        {client.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Клиентская база пока пустая"
                description="После первых записей администратор увидит здесь клиентов всей команды."
                ctaLabel="Открыть кабинет"
                ctaHref="/dashboard"
              />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="print-avoid-break print-no-shadow space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Настройки студии</h2>
              <p className="text-sm text-muted">
                Общие параметры рабочего пространства для всей команды.
              </p>
            </div>
            <WorkspaceSettingsForm
              workspaceName={workspace.name}
              workspaceKind={workspace.kind}
            />
          </Card>

          <Card className="print-avoid-break print-no-shadow space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Новый сотрудник</h2>
              <p className="text-sm text-muted">
                Добавь человека, задай ему базовые данные и выдай отдельный логин с паролем.
              </p>
            </div>
            <CreateTeamMemberForm
              defaultCity={resolveCityValue({
                locationText: profile.locationText,
                timezone: profile.timezone,
              })}
            />
          </Card>

          <Card className="print-avoid-break print-no-shadow space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Команда</h2>
              <p className="text-sm text-muted">
                По каждому сотруднику видно роль, статус, загрузку и состояние личного кабинета.
              </p>
            </div>
            <div className="space-y-3">
              {members.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  member={member}
                  currentProfileId={profile.id}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
