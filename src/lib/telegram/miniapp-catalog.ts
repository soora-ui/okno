import { normalizeBookingPageSettings } from "@/lib/booking-page-settings";
import { logError } from "@/lib/observability/logger";
import { defaultAvatarUrl, resolveProfileMediaUrl } from "@/lib/profile-media";
import { isDemoUsername } from "@/lib/reserved-usernames";
import { formatPublicProfileLink } from "@/lib/site";
import { hasActiveSubscription } from "@/lib/subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  canManageWorkspace,
  isAccountActive,
  isTeamWorkspaceKind,
  normalizeAccountRole,
  normalizeAccountStatus,
  normalizeWorkspaceKind,
} from "@/lib/workspace";

// Каталог мастеров для вкладки «Поиск» в мини-аппе.
//
// В каталог попадает тот же мастер, чья страница попадает в sitemap
// (src/lib/seo/public-profile.ts): активный аккаунт, действующий тариф, есть
// хотя бы одна активная услуга. Плюс два условия сверху: указан город и
// мастер не снял галочку «Показывать меня в поиске okno».
//
// Витрина студии (страница админа) сюда не входит: записываются к мастеру, а
// у витрины своего расписания нет. Сотрудники студии идут как обычные мастера.

export type CatalogMaster = {
  profileId: string;
  username: string;
  name: string;
  specialty: string;
  city: string;
  address: string;
  // null — мастер не загрузил фото: карточка рисует инициалы, а не чужой силуэт.
  avatarUrl: string | null;
  url: string;
  priceFrom: number | null;
  // До трёх услуг для карточки и все названия — для поиска по тексту.
  topServices: string[];
  serviceTitles: string[];
  rating: { average: number; count: number } | null;
};

export type CatalogCity = { name: string; count: number };

const USERNAME_PATTERN = /^[a-z0-9-]+$/;

// Каталог один на всех и меняется редко, а собирается тремя запросами по
// целым таблицам. Минуты кэша в памяти процесса хватает, чтобы набор текста в
// поиске не превращался в серию полных чтений.
const cacheTtlMs = 60_000;
let cache: { expiresAt: number; masters: CatalogMaster[] } | null = null;

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  specialty: string | null;
  location_text: string | null;
  address: string | null;
  avatar_url: string | null;
  booking_page_settings: unknown;
  workspace_id: string | null;
  workspace_kind: string | null;
  account_role: string | null;
  account_status: string | null;
  subscription_tier: string | null;
  subscription_until: string | null;
  subscription_paused_until: string | null;
  created_at: string | null;
};

export async function getCatalogMasters(): Promise<CatalogMaster[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.masters;
  }

  const admin = createSupabaseAdminClient();
  const [profilesResult, servicesResult, reviewsResult] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id,username,full_name,specialty,location_text,address,avatar_url,booking_page_settings,workspace_id,workspace_kind,account_role,account_status,subscription_tier,subscription_until,subscription_paused_until,created_at",
      )
      .not("username", "is", null),
    admin
      .from("services")
      .select("profile_id,title,price,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin.from("reviews").select("profile_id,rating"),
  ]);

  if (profilesResult.error || servicesResult.error) {
    logError("Mini app catalog: failed to read masters", {
      error: profilesResult.error ?? servicesResult.error,
    });
    // Старый список лучше пустого экрана: каталог не тот случай, где важна
    // свежесть до секунды.
    return cache?.masters ?? [];
  }

  const profiles = (profilesResult.data ?? []) as ProfileRow[];

  const servicesByProfile = new Map<string, { title: string; price: number }[]>();
  for (const row of servicesResult.data ?? []) {
    const profileId = String(row.profile_id);
    const list = servicesByProfile.get(profileId) ?? [];
    list.push({ title: String(row.title ?? "").trim(), price: Number(row.price ?? 0) });
    servicesByProfile.set(profileId, list);
  }

  // Отзывы не обязательны: без таблицы или при ошибке каталог просто
  // показывается без рейтинга.
  const ratingsByProfile = new Map<string, { total: number; count: number }>();
  for (const row of reviewsResult.error ? [] : (reviewsResult.data ?? [])) {
    const profileId = String(row.profile_id);
    const current = ratingsByProfile.get(profileId) ?? { total: 0, count: 0 };
    current.total += Number(row.rating ?? 0);
    current.count += 1;
    ratingsByProfile.set(profileId, current);
  }

  // Тариф студии оплачивает админ: доступ сотрудника считается по нему.
  const workspaceOf = (row: ProfileRow) => row.workspace_id ?? row.id;
  const workspaceAdmins = new Map<string, ProfileRow>();
  for (const row of profiles) {
    if (canManageWorkspace(normalizeAccountRole(row.account_role))) {
      workspaceAdmins.set(workspaceOf(row), row);
    }
  }

  const masters: CatalogMaster[] = [];

  for (const row of profiles) {
    const username = row.username ?? "";
    const services = servicesByProfile.get(row.id) ?? [];
    const city = (row.location_text ?? "").trim();

    if (!USERNAME_PATTERN.test(username) || isDemoUsername(username)) continue;
    if (!isAccountActive(normalizeAccountStatus(row.account_status))) continue;
    if (services.length === 0 || !city) continue;

    const isTeamShowcase =
      canManageWorkspace(normalizeAccountRole(row.account_role)) &&
      isTeamWorkspaceKind(normalizeWorkspaceKind(row.workspace_kind));
    if (isTeamShowcase) continue;

    const payer = workspaceAdmins.get(workspaceOf(row)) ?? row;
    const hasAccess = hasActiveSubscription({
      subscriptionTier: String(payer.subscription_tier ?? ""),
      subscriptionUntil: payer.subscription_until,
      subscriptionPausedUntil: payer.subscription_paused_until,
      joinedAt: payer.created_at,
    });
    if (!hasAccess) continue;

    if (!normalizeBookingPageSettings(row.booking_page_settings).showInCatalog) continue;

    const rating = ratingsByProfile.get(row.id);
    const prices = services.map((service) => service.price).filter((price) => price > 0);

    masters.push({
      profileId: row.id,
      username,
      name: capitalize(row.full_name ?? ""),
      specialty: (row.specialty ?? "").trim(),
      city,
      address: (row.address ?? "").trim(),
      avatarUrl: resolveAvatar(row.avatar_url),
      url: `https://${formatPublicProfileLink(username)}`,
      priceFrom: prices.length > 0 ? Math.min(...prices) : null,
      topServices: services.slice(0, 3).map((service) => service.title),
      serviceTitles: services.map((service) => service.title),
      rating: rating
        ? {
            average: Math.round((rating.total / rating.count) * 10) / 10,
            count: rating.count,
          }
        : null,
    });
  }

  cache = { expiresAt: Date.now() + cacheTtlMs, masters };

  return masters;
}

// Заглушку аватаром не считаем: вместо неё карточка рисует инициалы.
export function resolveAvatar(value: string | null | undefined) {
  const url = resolveProfileMediaUrl(value);
  return url && url !== defaultAvatarUrl ? url : null;
}

function capitalize(text: string) {
  const trimmed = text.trim();
  return trimmed.charAt(0).toLocaleUpperCase("ru") + trimmed.slice(1);
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
}

// Города, в которых есть хотя бы один мастер, — по убыванию числа мастеров.
// Справочник из тысячи городов тут вреден: выбрал город, а в нём пусто.
export function listCatalogCities(masters: CatalogMaster[]): CatalogCity[] {
  const counts = new Map<string, number>();
  for (const master of masters) {
    counts.set(master.city, (counts.get(master.city) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru"));
}

export const catalogPageSize = 30;

// Фильтр по городу и тексту. Текст ищется в имени, специализации и названиях
// услуг, все слова запроса должны найтись: «маникюр анна» сужает, а не
// расширяет. Сначала мастера с отзывами — по средней оценке, затем остальные.
export function searchCatalog(
  masters: CatalogMaster[],
  input: { city?: string | null; query?: string | null },
): CatalogMaster[] {
  const city = normalizeText(input.city ?? "");
  const words = normalizeText(input.query ?? "").split(/\s+/).filter(Boolean);

  return masters
    .filter((master) => {
      if (city && normalizeText(master.city) !== city) return false;
      if (words.length === 0) return true;

      const haystack = normalizeText(
        [master.name, master.specialty, ...master.serviceTitles].join(" "),
      );
      return words.every((word) => haystack.includes(word));
    })
    .sort((left, right) => {
      const leftScore = left.rating ? left.rating.average : -1;
      const rightScore = right.rating ? right.rating.average : -1;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return (right.rating?.count ?? 0) - (left.rating?.count ?? 0);
    })
    .slice(0, catalogPageSize);
}
