import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import {
  CalendarClock,
  Globe,
  PlusCircle,
  MessageCircle,
  ReceiptText,
  Settings2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { BookingCard } from "@/components/dashboard/booking-card";
import { CertificateScannerModal } from "@/components/dashboard/certificate-scanner-modal";
import { FreeWindowsCard } from "@/components/dashboard/free-windows-card";
import { AcquisitionSourcesCard } from "@/components/dashboard/acquisition-sources-card";
import { ManualBookingForm } from "@/components/forms/booking-operations";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackPromptCard } from "@/components/feedback/feedback-prompt-card";
import { getDashboardData } from "@/lib/data";
import { isDemoCabinetHeaders } from "@/lib/demo-cabinet";
import { getOwnerFreeWindows } from "@/lib/free-windows-data";
import { defaultStoryPalette } from "@/lib/free-windows-story-options";
import {
  acquisitionStatsDays,
  getOwnerAcquisitionStats,
} from "@/lib/acquisition-sources-data";
import { env } from "@/lib/env";
import { pickFeedbackPrompt } from "@/lib/feedback/service";
import { canManageWorkspace, isTeamWorkspaceKind } from "@/lib/workspace";
import { pluralizeRu } from "@/lib/utils";
import { formatSubscriptionUntil, resolveSubscription } from "@/lib/subscription";
import { getPlan } from "@/config/plans";

function pluralizeActiveBookings(count: number) {
  return pluralizeRu(
    count,
    "активная запись",
    "активные записи",
    "активных записей",
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data) {
    redirect("/login");
  }

  const { bookings, clients, profile, services } = data;
  const showWorkspaceAdminLink =
    canManageWorkspace(profile.accountRole) &&
    isTeamWorkspaceKind(profile.workspaceKind);
  const now = DateTime.now().setZone(profile.timezone);
  // Лимита записей больше нет: доступ определяется тарифом или пробным
  // периодом. Здесь показываем, сколько дней доступа осталось.
  const subscription = resolveSubscription(profile);
  // Демо-кабинет отдаёт картинку со своего адреса: заголовок демо proxy
  // ставит только на /demo/cabinet/*, на /api запрос ушёл бы без него.
  const freeWindowsStoryHref = isDemoCabinetHeaders(await headers())
    ? "/demo/cabinet/free-windows-story"
    : "/api/free-windows/story";
  const [feedbackPrompt, freeWindows, acquisitionStats] = await Promise.all([
    pickFeedbackPrompt(profile),
    getOwnerFreeWindows({ profile, source: data.source }),
    getOwnerAcquisitionStats({ profileId: profile.id, source: data.source }),
  ]);
  // Источники — только у соло-мастера: у студии свой путь к форме записи.
  const showAcquisitionSources =
    Boolean(profile.username) && !isTeamWorkspaceKind(profile.workspaceKind);
  const pausedUntilLabel = formatSubscriptionUntil(subscription.pausedUntil);
  const subscriptionPlan = subscription.planId ? getPlan(subscription.planId) : null;
  const accessUntilLabel = formatSubscriptionUntil(subscription.activeUntil);
  const daysLeft = subscription.activeUntil
    ? Math.max(
        0,
        Math.ceil(
          DateTime.fromISO(subscription.activeUntil).diff(now, "days").days,
        ),
      )
    : null;
  const accessTone = !subscription.isActive
    ? "#c96b5c"
    : daysLeft !== null && daysLeft <= 5
      ? "var(--color-warning)"
      : "var(--color-success)";
  const todayKey = now.toFormat("yyyy-MM-dd");
  const confirmedBookings = bookings
    .filter((booking) => booking.status === "confirmed")
    .map((booking) => ({
      booking,
      startsAt: DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
        profile.timezone,
      ),
    }))
    .sort((left, right) => left.startsAt.toMillis() - right.startsAt.toMillis());
  const todayBookings = confirmedBookings
    .filter(({ startsAt }) => startsAt.toFormat("yyyy-MM-dd") === todayKey)
    .map(({ booking }) => booking);
  const upcomingBookings = confirmedBookings
    .filter(({ startsAt }) => startsAt > now && startsAt.toFormat("yyyy-MM-dd") !== todayKey)
    .map(({ booking }) => booking);
  const weekStart = now.startOf("week");
  const weekEnd = weekStart.plus({ days: 7 });
  const monthStart = now.startOf("month");
  const monthEnd = monthStart.plus({ months: 1 });
  const servicesMap = new Map(services.map((service) => [service.id, service]));
  const weeklyBookings = bookings.filter((booking) => {
    if (booking.status !== "confirmed") return false;
    const startsAt = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
      profile.timezone,
    );
    return startsAt >= weekStart && startsAt < weekEnd;
  });
  const monthlyRevenue = bookings.reduce((total, booking) => {
    if (booking.status !== "confirmed") return total;
    const startsAt = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
      profile.timezone,
    );
    if (startsAt < monthStart || startsAt >= monthEnd) {
      return total;
    }

    return total + (booking.price ?? servicesMap.get(booking.serviceId)?.price ?? 0);
  }, 0);
  const manualBookingsThisMonth = bookings.filter((booking) => {
    if (booking.status !== "confirmed" || booking.source !== "manual") return false;
    const startsAt = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
      profile.timezone,
    );
    return startsAt >= monthStart && startsAt < monthEnd;
  }).length;
  // Модуль 1 (рейтинг надёжности клиентов): визиты без отметки не попадают
  // в client_reliability, поэтому напоминаем мастеру их разметить — иначе
  // рейтинг остаётся пустым из-за забывчивости (ТЗ 1.3.А).
  const unmarkedPastVisitsCount = bookings.filter((booking) => {
    if (booking.status !== "confirmed" || booking.visitStatus !== "pending") return false;
    const startsAt = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(
      profile.timezone,
    );
    return startsAt < now;
  }).length;

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Badge tone="accent">Кабинет мастера</Badge>
          <h1 className="text-4xl font-semibold text-ink">
            Добрый день, {profile.fullName}
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-ink-soft">
            Сегодня у тебя {pluralizeActiveBookings(todayBookings.length)}. Внизу все ближайшие визиты и
            быстрые действия по кабинету.
          </p>
        </div>
      </div>

      {feedbackPrompt ? (
        <FeedbackPromptCard
          key={feedbackPrompt.key}
          promptKey={feedbackPrompt.key}
          kind={feedbackPrompt.kind}
        />
      ) : null}

      {unmarkedPastVisitsCount > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-panel">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink">
              У вас {pluralizeRu(unmarkedPastVisitsCount, "визит", "визита", "визитов")}{" "}
              без отметки
            </p>
            <p className="text-sm leading-6 text-ink-soft">
              Отметь, состоялись ли прошедшие визиты — это влияет на рейтинг надёжности клиентов.
            </p>
          </div>
          <ButtonLink href="/archive" variant="secondary">
            Отметить в архиве
          </ButtonLink>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="grid gap-4 md:auto-rows-fr md:grid-cols-3">
            <Card className="space-y-2">
              <CalendarClock className="text-accent-deep" size={22} />
              <p className="text-sm text-muted">Записи сегодня</p>
              <p className="text-3xl font-semibold text-ink">{todayBookings.length}</p>
            </Card>
            <Card className="space-y-2">
              <ReceiptText className="text-warning" size={22} />
              <p className="text-sm text-muted">Записи на этой неделе</p>
              <p className="text-3xl font-semibold text-ink">
                {weeklyBookings.length}
              </p>
            </Card>
            <Card className="space-y-2">
              <Wallet className="text-success" size={22} />
              <p className="text-sm text-muted">Выручка за месяц</p>
              <p className="text-3xl font-semibold text-ink">
                {new Intl.NumberFormat("ru-RU").format(monthlyRevenue)} ₽
              </p>
              <Link
                href="/analytics"
                className="text-sm text-accent-deep underline-offset-4 hover:underline"
              >
                Подробнее в аналитике
              </Link>
            </Card>
          </div>

          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-ink">Ближайшие записи</h2>
                <p className="text-sm text-muted">
                  Сначала показываем визиты на сегодня, потом все остальные по датам.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/archive" variant="secondary">
                  Архив
                </ButtonLink>
                <ButtonLink href="/schedule" variant="secondary">
                  Открыть расписание
                </ButtonLink>
              </div>
            </div>
            <div className="space-y-6">
              <div id="today-bookings" className="scroll-mt-28 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">Сегодня</h3>
                  <span className="text-sm text-muted">
                    {now.setLocale("ru").toFormat("d MMMM")}
                  </span>
                </div>
                {todayBookings.length > 0 ? (
                  <div className="space-y-3">
                    {todayBookings.map((booking) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        clients={clients}
                        services={services}
                        timezone={profile.timezone}
                        showDate={false}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-nested border border-dashed border-line p-5 text-sm text-muted">
                    На сегодня записей пока нет.
                  </div>
                )}
              </div>

              <div id="future-bookings" className="scroll-mt-28 space-y-3">
                <h3 className="text-lg font-semibold text-ink">Предстоящие дни</h3>
                {upcomingBookings.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingBookings.map((booking) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        clients={clients}
                        services={services}
                        timezone={profile.timezone}
                        showDate
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-nested border border-dashed border-line p-5 text-sm text-muted">
                    Предстоящих записей после сегодняшнего дня пока нет.
                  </div>
                )}
              </div>

            </div>
          </Card>

          <EmptyState
            title="Быстрый доступ к своей странице"
            description="Проверь, как выглядит запись для клиента, и при необходимости сразу подправь расписание или услуги."
            ctaLabel="Открыть публичную страницу"
            ctaHref={`/${profile.username}`}
          />

          <Card className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-ink">
                Быстрые действия
              </h2>
              <p className="text-sm text-muted">
                Полезные шаги, которые можно сделать прямо сейчас.
              </p>
            </div>
            <div className="space-y-3">
              <QuickAction
                icon={<Settings2 size={18} className="text-accent-deep" />}
                title="Проверить параметры записи"
                description="Окно записи, шаг времени и буфер между клиентами."
                href="/settings"
                ctaLabel="Открыть настройки"
                statusLabel="Важно"
                statusTone="accent"
              />
              <QuickAction
                icon={<MessageCircle size={18} className="text-success" />}
                title="Подключить Telegram"
                description={
                  profile.telegramChatId
                    ? "Telegram уже подключен, уведомления можно получать сразу."
                    : "Чтобы быстрее узнавать о новых визитах и изменениях."
                }
                href="/settings"
                ctaLabel={profile.telegramChatId ? "Проверить подключение" : "Подключить"}
                statusLabel={profile.telegramChatId ? "Готово" : "Не подключено"}
                statusTone={profile.telegramChatId ? "success" : "warning"}
              />
              <QuickAction
                icon={<Globe size={18} className="text-warning" />}
                title="Открыть публичную страницу"
                description="Посмотри, как запись выглядит для клиента с телефона."
                href={`/${profile.username}`}
                ctaLabel="Открыть страницу"
                statusLabel="Проверка"
                statusTone="neutral"
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {showWorkspaceAdminLink ? (
            <Card className="space-y-4 bg-panel">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">Команда под контролем</p>
                <p className="text-sm leading-6 text-ink-soft">
                  Личный кабинет мастера остался отдельным. Управление студией, сотрудниками и общей картиной вынесено в админский раздел.
                </p>
              </div>
              <ButtonLink href="/team" variant="secondary">
                Открыть админку
              </ButtonLink>
            </Card>
          ) : null}

          <Card
            className="space-y-4 border-transparent text-white"
            style={{
              background:
                "var(--gradient-ink)",
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={18} />
              <p className="text-sm uppercase tracking-[0.24em] text-white/60">
                {subscriptionPlan
                  ? "Тариф"
                  : subscription.isTrial
                    ? "Пробный период"
                    : "Доступ"}
              </p>
            </div>
            <p className="text-4xl font-semibold text-white">
              {subscriptionPlan
                ? subscriptionPlan.title
                : subscription.isTrial
                  ? daysLeft !== null
                    ? pluralizeRu(daysLeft, "день", "дня", "дней")
                    : "Активен"
                  : "Не подключён"}
            </p>
            <p className="text-sm leading-7 text-white/70">
              {subscription.pausedUntil
                ? `На паузе до ${pausedUntilLabel}: клиенты пока не могут записаться. Оплаченные дни сохранены — тариф продлится до ${accessUntilLabel}.`
                : subscription.isActive
                ? accessUntilLabel
                  ? subscription.isTrial
                    ? `Бесплатный доступ ко всем возможностям до ${accessUntilLabel}. Дальше нужен тариф.`
                    : `Оплачен до ${accessUntilLabel}. Автосписания нет — продлевать нужно вручную.`
                  : "Доступ активен бессрочно."
                : "Публичная запись у клиентов не работает. Подключи тариф в настройках."}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: subscription.isActive ? "100%" : "8%",
                  background: accessTone,
                }}
              />
            </div>
            <ButtonLink
              href="/settings?tab=account"
              variant="secondary"
              className="w-fit bg-surface text-ink"
            >
              {subscription.pausedUntil
                ? "Вернуться раньше"
                : subscriptionPlan
                  ? "Продлить или сменить тариф"
                  : "Открыть тарифы"}
            </ButtonLink>
          </Card>

          {freeWindows.status === "ready" ? (
            <FreeWindowsCard
              days={freeWindows.days}
              bookingUrl={freeWindows.bookingUrl}
              storyHref={freeWindowsStoryHref}
              storyDefaultPalette={defaultStoryPalette(profile.bookingThemePresetId)}
            />
          ) : null}

          {showAcquisitionSources ? (
            <AcquisitionSourcesCard
              bookingUrl={`${env.appUrl}/${profile.username}`}
              stats={acquisitionStats}
              statsDays={acquisitionStatsDays}
            />
          ) : null}

          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <PlusCircle size={18} className="text-accent-deep" />
              <div>
                <h2 className="text-2xl font-semibold text-ink">
                  Ручная запись
                </h2>
                <p className="text-sm text-muted">
                  Для клиентов из звонков, WhatsApp или личных сообщений.
                </p>
              </div>
            </div>
            <div className="rounded-panel bg-panel px-4 py-3 text-sm text-ink-soft">
              В этом месяце вручную добавлено{" "}
              {pluralizeRu(manualBookingsThisMonth, "запись", "записи", "записей")}.
            </div>
            <ManualBookingForm
              services={services}
              profile={profile}
              defaultDate={now.toISODate() ?? ""}
            />
          </Card>

          <CertificateScannerModal />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  description,
  href,
  ctaLabel,
  statusLabel,
  statusTone,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  statusLabel: string;
  statusTone: "neutral" | "success" | "accent" | "warning";
}) {
  return (
    <div className="rounded-panel border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3">
            {icon}
            <p className="font-medium text-ink">{title}</p>
          </div>
          <p className="text-sm leading-6 text-ink-soft">
            {description}
          </p>
        </div>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>
      <div className="mt-4">
        <ButtonLink href={href} variant="secondary">
          {ctaLabel}
        </ButtonLink>
      </div>
    </div>
  );
}
