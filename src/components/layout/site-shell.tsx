import { Suspense } from "react";
import Link from "next/link";
import { AuthenticatedRoutePrefetch } from "@/components/layout/authenticated-route-prefetch";
import { AccountMenu } from "@/components/layout/account-menu";
import { BrandLogo } from "@/components/layout/brand-logo";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
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
}: {
  children: React.ReactNode;
  compact?: boolean;
  hideGuestMenu?: boolean;
  showAccountNotifications?: boolean;
  publicPageHrefOverride?: string;
  publicPageLabelOverride?: string;
  resolveAuth?: boolean;
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
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--color-background)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(184,211,196,0.4),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(247,226,211,0.6),_transparent_30%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <header className="print-static sticky top-4 z-20 mb-6 rounded-full border border-line bg-surface px-4 py-3">
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
                    key={link.href}
                    href={link.href}
                    className="text-sm text-ink-soft transition hover:text-ink"
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
                  <AccountMenu
                    authenticated
                    username={authProfile.profile.username}
                    showTeamLink={isWorkspaceAdmin}
                  />
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
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
