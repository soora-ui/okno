import type { Metadata } from "next";
import { defaultOgImage, siteName, siteUrl } from "@/config/site";
import type { PublicPageData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import type { Profile, Service } from "@/lib/mock-data";
import { hasActiveSubscription } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  canManageWorkspace,
  getWorkspaceKindLabel,
  isAccountActive,
  isTeamWorkspaceKind,
  normalizeAccountRole,
  normalizeAccountStatus,
  normalizeWorkspaceKind,
} from "@/lib/workspace";

// Тот же формат, что принимает маршрут /[username].
const USERNAME_PATTERN = /^[a-z0-9-]+$/;

// Мета-теги и разметка публичной страницы мастера или студии. Эти страницы —
// продвижение самого мастера: клиент ищет «маникюр Симферополь запись», а не
// «okno». Поэтому в title и description — имя, специализация, город и
// услуги, а бренд сервиса только в og:site_name.

type PublicPageSummary = {
  name: string;
  specialty: string;
  city: string;
  address: string;
  bio: string;
  avatarUrl: string | null;
  services: Service[];
};

function summarize(data: PublicPageData): PublicPageSummary {
  const { profile } = data;
  const services =
    data.kind === "team"
      ? data.members.flatMap((member) => member.services)
      : data.services;

  return {
    name: capitalize(data.kind === "team" ? profile.workspaceName : profile.fullName),
    specialty:
      data.kind === "team"
        ? getWorkspaceKindLabel(profile.workspaceKind)
        : profile.specialty.trim(),
    city: profile.locationText.trim(),
    address: profile.address.trim(),
    bio: profile.bio.trim(),
    avatarUrl: hasOwnAvatar(profile) ? absoluteUrl(profile.avatarUrl) : null,
    services: services.filter((service) => service.isActive),
  };
}

// Имя мастер вводит как попало («никита»), а в сниппете оно стоит первым.
function capitalize(text: string) {
  const trimmed = text.trim();
  return trimmed.charAt(0).toLocaleUpperCase("ru") + trimmed.slice(1);
}

// Заглушку аватара в превью не ставим: общая картинка okno честнее чужого
// силуэта.
function hasOwnAvatar(profile: Profile) {
  return Boolean(profile.avatarPath);
}

function absoluteUrl(url: string) {
  return new URL(url, siteUrl).toString();
}

// Аватары лежат в оригинале (бывает по 2 МБ) — Telegram и VK такие тянут
// медленно или не тянут вовсе. Отдаём через оптимизатор Next: 1080 px и
// q=75 — ширина и качество из его разрешённых по умолчанию.
function previewImageUrl(url: string) {
  return `${siteUrl}/_next/image?url=${encodeURIComponent(url)}&w=1080&q=75`;
}

function truncate(text: string, max: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const cut = normalized.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")) || cut}…`;
}

function minPrice(services: Service[]) {
  const prices = services.map((service) => service.price).filter((price) => price > 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function buildTitle(summary: PublicPageSummary) {
  const who = [summary.specialty, summary.city].filter(Boolean).join(", ");
  return `${summary.name}${who ? ` — ${who}` : ""}: онлайн-запись`;
}

function buildDescription(summary: PublicPageSummary) {
  const serviceNames = summary.services
    .slice(0, 3)
    .map((service) => service.title.trim())
    .filter(Boolean);
  const price = minPrice(summary.services);
  const parts = [
    serviceNames.length > 0
      ? `Онлайн-запись: ${serviceNames.join(", ")}.`
      : `Онлайн-запись к ${summary.name}.`,
    price ? `Цены от ${price} ₽.` : "",
    summary.address || summary.city ? `${summary.address || summary.city}.` : "",
    "Выберите свободное время без звонков и регистрации.",
  ];
  return truncate(parts.filter(Boolean).join(" "), 200);
}

export function buildPublicProfileMetadata(
  data: PublicPageData,
  username: string,
): Metadata {
  const summary = summarize(data);
  const title = buildTitle(summary);
  const description = buildDescription(summary);
  const path = `/${username}`;

  return {
    // Абсолютный title: шаблон с « — okno» здесь не нужен, место в сниппете
    // дороже отдать городу и специализации.
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    // Страница без услуг — пустая визитка: в выдаче она только навредит и
    // мастеру, и сайту. Как появятся услуги, страница откроется сама.
    robots: { index: summary.services.length > 0, follow: true },
    openGraph: {
      title,
      description,
      url: path,
      siteName,
      locale: "ru_RU",
      type: "profile",
      images: summary.avatarUrl
        ? [{ url: previewImageUrl(summary.avatarUrl), alt: summary.name }]
        : [defaultOgImage],
    },
  };
}

export function buildPublicProfileJsonLd(data: PublicPageData, username: string) {
  const summary = summarize(data);
  const url = `${siteUrl}/${username}`;

  return {
    "@context": "https://schema.org",
    "@type": data.profile.workspaceKind === "barbershop" ? "HairSalon" : "HealthAndBeautyBusiness",
    "@id": `${url}#business`,
    name: summary.name,
    url,
    ...(summary.bio ? { description: truncate(summary.bio, 500) } : {}),
    ...(summary.avatarUrl ? { image: summary.avatarUrl } : {}),
    ...(summary.city || summary.address
      ? {
          address: {
            "@type": "PostalAddress",
            ...(summary.city ? { addressLocality: summary.city } : {}),
            ...(summary.address ? { streetAddress: summary.address } : {}),
          },
        }
      : {}),
    ...(summary.services.length > 0
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: "Услуги",
            itemListElement: summary.services.map((service) => ({
              "@type": "Offer",
              itemOffered: { "@type": "Service", name: service.title.trim() },
              ...(service.price > 0
                ? { price: service.price, priceCurrency: "RUB" }
                : {}),
            })),
          },
        }
      : {}),
    potentialAction: {
      "@type": "ReserveAction",
      target: `${url}/book`,
    },
  };
}

type SitemapProfileRow = {
  id: string;
  username: string | null;
  workspace_id: string | null;
  workspace_kind: string | null;
  account_role: string | null;
  account_status: string | null;
  subscription_tier: string | null;
  subscription_until: string | null;
  created_at: string | null;
};

// Адреса публичных страниц для sitemap: аккаунт активен, страница принимает
// записи (подписка или пробный период) и в ней есть хотя бы одна услуга —
// своя у мастера, у студии — у кого-то из команды. Подписку сотрудника
// оплачивает владелец, поэтому доступ смотрим по админу его рабочего
// пространства.
export async function getIndexablePublicProfilePaths(): Promise<string[]> {
  if (!isSupabaseConfigured) return [];

  const admin = createSupabaseAdminClient();
  const [profilesResult, servicesResult] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id,username,workspace_id,workspace_kind,account_role,account_status,subscription_tier,subscription_until,created_at",
      )
      .not("username", "is", null),
    admin.from("services").select("profile_id").eq("is_active", true),
  ]);

  if (profilesResult.error || servicesResult.error) {
    throw new Error("Не получилось собрать страницы мастеров для sitemap.");
  }

  const profiles = (profilesResult.data ?? []) as SitemapProfileRow[];
  const profilesWithServices = new Set(
    (servicesResult.data ?? []).map((row) => String(row.profile_id)),
  );

  const workspaceOf = (row: SitemapProfileRow) => row.workspace_id ?? row.id;
  const workspaceAdmins = new Map<string, SitemapProfileRow>();
  const workspacesWithServices = new Set<string>();
  for (const row of profiles) {
    if (canManageWorkspace(normalizeAccountRole(row.account_role))) {
      workspaceAdmins.set(workspaceOf(row), row);
    }
    if (profilesWithServices.has(row.id)) {
      workspacesWithServices.add(workspaceOf(row));
    }
  }

  return profiles
    .filter((row) => {
      if (!row.username || !USERNAME_PATTERN.test(row.username)) return false;
      if (!isAccountActive(normalizeAccountStatus(row.account_status))) return false;

      const payer = workspaceAdmins.get(workspaceOf(row)) ?? row;
      const hasAccess = hasActiveSubscription({
        subscriptionTier: String(payer.subscription_tier ?? ""),
        subscriptionUntil: payer.subscription_until,
        joinedAt: payer.created_at,
      });
      if (!hasAccess) return false;

      const isTeamPage =
        canManageWorkspace(normalizeAccountRole(row.account_role)) &&
        isTeamWorkspaceKind(normalizeWorkspaceKind(row.workspace_kind));
      return isTeamPage
        ? workspacesWithServices.has(workspaceOf(row))
        : profilesWithServices.has(row.id);
    })
    .map((row) => `/${row.username}`);
}
