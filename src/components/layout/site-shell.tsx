import { Suspense } from "react";
import Link from "next/link";
import { AuthenticatedRoutePrefetch } from "@/components/layout/authenticated-route-prefetch";
import { AccountMenu } from "@/components/layout/account-menu";
import { BrowserToolbarOffset } from "@/components/layout/browser-toolbar-offset";
import { CabinetBottomNav } from "@/components/dashboard/bottom-nav";
import { BrandLogo } from "@/components/layout/brand-logo";
import { PageTransition } from "@/components/layout/page-transition";
import { InstallAppPrompt } from "@/components/pwa/install-app-prompt";
import { SiteFooter } from "@/components/layout/site-footer";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { SupportChatWidget } from "@/components/support/support-chat-widget";
import { ButtonLink } from "@/components/ui/button";
import { appMode } from "@/lib/env";
import { getAccountNotificationPanelData, getCurrentAuthProfile } from "@/lib/data";
import { landingDemoPublicPageHref } from "@/lib/landing-demo";
import {
  canManageWorkspace,
  getDefaultAccountRoute,
  isTeamWorkspaceKind,
} from "@/lib/workspace";

async function AccountNotificationsSlot({
  authProfile,
}: {
  authProfile: NonNullable<Awaited<ReturnType<typeof getCurrentAuthProfile>>>;
}) {
  let accountNotifications: Awaited<
    ReturnType<typeof getAccountNotificationPanelData>
  >;

  try {
    accountNotifications = await getAccountNotificationPanelData(authProfile);
  } catch {
    return null;
  }

  return (
    <NotificationsPanel
      items={accountNotifications.items}
      storageKey={accountNotifications.storageKey}
      dismissedStorageKey={accountNotifications.dismissedStorageKey}
    />
  );
}

export async function SiteShell({
  children,
  compact = false,
  hideGuestMenu = false,
  showAccountNotifications = false,
  publicPageHrefOverride,
  publicPageLabelOverride,
  resolveAuth = true,
  showFooter = false,
  showSupportWidget = true,
  bottomNav = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
  hideGuestMenu?: boolean;
  showAccountNotifications?: boolean;
  publicPageHrefOverride?: string;
  publicPageLabelOverride?: string;
  resolveAuth?: boolean;
  // Футер со ссылками на правовые документы нужен на витрине сервиса. На
  // публичных страницах записи он лишний: там оболочка принадлежит мастеру,
  // а не платформе.
  showFooter?: boolean;
  // Виджет AI-поддержки отвечает на вопросы про устройство okno — тарифы,
  // настройки, подключение платежей. Клиенту мастера он не нужен и вреден:
  // тот пришёл записаться, а получает чат про чужой личный кабинет. По той же
  // причине, что и футер, — на страницах записи оболочка принадлежит мастеру.
  showSupportWidget?: boolean;
  bottomNav?: boolean;
}) {
  let authProfile: Awaited<ReturnType<typeof getCurrentAuthProfile>> | null = null;

  if (resolveAuth) {
    try {
      authProfile = await getCurrentAuthProfile();
    } catch {
      authProfile = null;
    }
  }
  const isWorkspaceAdmin = Boolean(
    authProfile &&
      canManageWorkspace(authProfile.profile.accountRole) &&
      isTeamWorkspaceKind(authProfile.profile.workspaceKind),
  );
  const publicPageHref =
    publicPageHrefOverride ??
    (authProfile ? `/${authProfile.profile.username}` : landingDemoPublicPageHref);
  const publicPageLabel = publicPageLabelOverride ?? "Публичная страница";
  const homeHref = authProfile
    ? getDefaultAccountRoute({
        accountRole: authProfile.profile.accountRole,
        workspaceKind: authProfile.profile.workspaceKind,
      })
    : "/";
  const prefetchRoutes = isWorkspaceAdmin
    ? ["/settings", "/schedule", "/team", "/archive"]
    : ["/settings", "/schedule", "/clients", "/archive"];
  const links = authProfile
    ? isWorkspaceAdmin
      ? [
          { href: homeHref, label: "Главная" },
          { href: "/pricing", label: "Тарифы" },
          { href: "/team", label: "Команда" },
          { href: "/dashboard", label: "Мой кабинет" },
        ]
      : [
          { href: homeHref, label: "Главная" },
          { href: "/pricing", label: "Тарифы" },
          { href: "/dashboard", label: "Кабинет" },
          { href: publicPageHref, label: publicPageLabel },
        ]
    : [
        { href: "/", label: "Главная" },
        { href: "/pricing", label: "Тарифы" },
        { href: "/dashboard", label: "Кабинет" },
        { href: publicPageHref, label: publicPageLabel },
      ];

  return (
    <div className="relative min-h-[calc(100svh-env(safe-area-inset-top))] overflow-x-clip bg-[var(--color-background)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_var(--color-glow-cool),_transparent_30%),radial-gradient(circle_at_bottom_right,_var(--color-glow-warm),_transparent_30%)]" />
      <div className="relative mx-auto flex min-h-[calc(100svh-env(safe-area-inset-top))] w-full max-w-[96rem] flex-col px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <header className="print-static sticky top-[calc(1rem+env(safe-area-inset-top))] z-20 mb-6 rounded-full border border-line bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <BrandLogo href={homeHref}>
              {appMode === "demo" ? (
                <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
                  demo
                </span>
              ) : null}
            </BrandLogo>
            {!compact ? (
              <nav className="hidden items-center gap-5 md:flex">
                {links.map((link) => (
                  <Link
                    key={`${link.href}::${link.label}`}
                    href={link.href}
                    className="inline-flex min-h-6 items-center text-sm text-ink-soft transition hover:text-ink"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            <div className="flex items-center gap-3">
              {authProfile ? (
                <>
                  <AuthenticatedRoutePrefetch routes={prefetchRoutes} />
                  {showAccountNotifications ? (
                    <Suspense fallback={null}>
                      <AccountNotificationsSlot authProfile={authProfile} />
                    </Suspense>
                  ) : null}
                  {/* Нижняя панель уже ведёт во все основные разделы, поэтому
                      на мобильном бургер дублировал бы её. На десктопе панели
                      нет — там меню остаётся единственной навигацией. */}
                  <div className={bottomNav ? "max-md:hidden" : undefined}>
                    <AccountMenu
                      authenticated
                      username={authProfile.profile.username}
                      showTeamLink={isWorkspaceAdmin}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="hidden items-center gap-3 sm:flex">
                    <ButtonLink href="/login" variant="ghost">
                      Войти
                    </ButtonLink>
                    <ButtonLink href="/register">Начать бесплатно</ButtonLink>
                  </div>
                  <div className={hideGuestMenu ? "hidden" : "sm:hidden"}>
                    <AccountMenu authenticated={false} />
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main
          className={
            // Панель перекрывает низ страницы, поэтому под контентом нужен
            // запас её высоты плюс safe area — иначе последняя карточка
            // оказывается под вкладками.
            bottomNav
              ? "flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
              : "flex-1"
          }
        >
          {bottomNav ? <InstallAppPrompt /> : null}
          <PageTransition>{children}</PageTransition>
        </main>
        {showFooter ? <SiteFooter /> : null}
      </div>
      {bottomNav ? (
        <>
          <BrowserToolbarOffset />
          <CabinetBottomNav />
        </>
      ) : null}
      {showSupportWidget ? <SupportChatWidget raised={bottomNav} /> : null}
    </div>
  );
}
