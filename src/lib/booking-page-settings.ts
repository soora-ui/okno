import { DateTime } from "luxon";
import { z } from "zod";

/**
 * Per-master customization of the public booking page. Stored as a single
 * JSONB column (`profiles.booking_page_settings`) so we can extend it without
 * new migrations. Always read through `normalizeBookingPageSettings` so older
 * profiles merge with safe defaults.
 *
 * Stage 1 scope: first-screen pitch (headline/subheadline) and the booking
 * comment field mode. Later stages add page emphasis, important notes, etc.
 */

export const commentFieldModes = ["hidden", "optional", "required"] as const;
export type CommentFieldMode = (typeof commentFieldModes)[number];

export const headlineMaxLength = 80;
export const subheadlineMaxLength = 160;

// Как клиенту связаться с мастером напрямую — телефон, ник в мессенджере,
// ссылка. Свободная строка, а не телефон: мастера ведут переписку кто в
// Telegram, кто в WhatsApp, и навязывать один канал не за что.
//
// Поле появилось под AI-консультанта: когда в мануале услуги нет ответа,
// клиента надо отправить к живому мастеру, а отправлять было некуда —
// telegram_chat_id профиля служебный (в него сервис шлёт уведомления самому
// мастеру) и клиенту его показывать нельзя.
export const masterContactMaxLength = 120;

// Подарочные сертификаты: номинал в рублях, ограничен разумным диапазоном,
// чтобы не пораниться о случайно введенное огромное число.
export const giftCertificateMinAmount = 500;
export const giftCertificateMaxAmount = 50_000;
export const maxGiftCertificateDenominations = 6;
export const defaultGiftCertificateDenominations = [1000, 2000, 3000];

// Соцсети мастера на публичной странице. Храним только ник/идентификатор,
// а ссылку собираем при показе: мастер вставляет кто «@alina», кто полную
// ссылку из браузера, кто «t.me/alina» — к одному виду их приводит
// normalizeSocialHandle, и на странице не оказывается битых ссылок.
export const socialNetworks = ["telegram", "vk", "instagram", "twitter", "tiktok"] as const;
export type SocialNetwork = (typeof socialNetworks)[number];
export type SocialLinks = Record<SocialNetwork, string>;

export const socialNetworkMeta: Record<
  SocialNetwork,
  { label: string; placeholder: string; hosts: string[]; buildUrl: (handle: string) => string }
> = {
  telegram: {
    label: "Telegram",
    placeholder: "@alina_nails или t.me/alina_nails",
    hosts: ["t.me", "telegram.me"],
    buildUrl: (handle) => `https://t.me/${handle}`,
  },
  vk: {
    label: "ВКонтакте",
    placeholder: "alina_nails или vk.com/alina_nails",
    hosts: ["vk.com", "vk.ru", "m.vk.com"],
    buildUrl: (handle) => `https://vk.com/${handle}`,
  },
  instagram: {
    label: "Instagram",
    placeholder: "@alina_nails",
    hosts: ["instagram.com"],
    buildUrl: (handle) => `https://instagram.com/${handle}`,
  },
  twitter: {
    label: "X (Twitter)",
    placeholder: "@alina_nails",
    hosts: ["x.com", "twitter.com"],
    buildUrl: (handle) => `https://x.com/${handle}`,
  },
  tiktok: {
    label: "TikTok",
    placeholder: "@alina_nails",
    hosts: ["tiktok.com"],
    buildUrl: (handle) => `https://www.tiktok.com/@${handle}`,
  },
};

export const emptySocialLinks: SocialLinks = {
  telegram: "",
  vk: "",
  instagram: "",
  twitter: "",
  tiktok: "",
};

const socialHandlePattern = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * «@alina», «alina», «https://t.me/alina», «instagram.com/alina/?hl=ru» → «alina».
 * null — строку не удалось разобрать (чужой домен, пробелы, кириллица).
 * Пустая строка — поле очищено.
 */
export function normalizeSocialHandle(network: SocialNetwork, raw: string): string | null {
  const value = raw.trim();
  if (!value) return "";

  let handle = value;
  const looksLikeUrl = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}\//i.test(value);
  if (looksLikeUrl) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!socialNetworkMeta[network].hosts.includes(host)) return null;
    handle = url.pathname.split("/").filter(Boolean)[0] ?? "";
  }

  handle = handle.replace(/^@/, "");
  return socialHandlePattern.test(handle) ? handle : null;
}

// Точка на карте: координаты, которые мастер выбрал в настройках. Отдельно от
// текстового адреса — адрес пишут как удобно («вход со двора, 3 этаж»), а
// карте нужна точная точка.
export type MapLocation = { lat: number; lon: number; zoom: number };

export const defaultMapZoom = 16;

const mapLocationSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  zoom: z.coerce.number().int().min(3).max(19).default(defaultMapZoom),
});

export function parseMapLocation(raw: unknown): MapLocation | null {
  const parsed = mapLocationSchema.safeParse(raw);
  if (!parsed.success) return null;
  // 0,0 — точка в океане, а не реальный адрес: так выглядят пустые поля формы.
  if (parsed.data.lat === 0 && parsed.data.lon === 0) return null;
  return {
    lat: Math.round(parsed.data.lat * 1e6) / 1e6,
    lon: Math.round(parsed.data.lon * 1e6) / 1e6,
    zoom: parsed.data.zoom,
  };
}

// Маршрут строим в Яндекс Картах: сама карта на странице — OpenStreetMap
// (бесплатно, без ключа и рекламы), но навигатором клиенты в РФ пользуются
// яндексовским, и ссылка с маршрутом открывает его приложение.
export function buildYandexRouteUrl(location: MapLocation) {
  return `https://yandex.ru/maps/?rtext=~${location.lat},${location.lon}&rtt=auto`;
}

export type BookingPageSettings = {
  schemaVersion: 1;
  headline: string;
  subheadline: string;
  commentFieldMode: CommentFieldMode;
  /** Пустая строка — контакт не указан, консультант зовёт к мастеру без деталей. */
  masterContact: string;
  giftCertificatesEnabled: boolean;
  giftCertificateDenominations: number[];
  // Срок действия сертификатов: либо бессрочно (по умолчанию), либо
  // конкретная дата — поля взаимоисключающие. Уже выпущенные сертификаты
  // хранят expires_at, вычисленный на момент покупки из этих настроек, и
  // не меняются при последующей смене настроек мастером.
  giftCertificateNoExpiry: boolean;
  giftCertificateExpiryDate: string | null;
  /** Пустая строка — соцсеть не указана и на странице не показывается. */
  socialLinks: SocialLinks;
  /** null — точка не выбрана, блока с картой на странице нет. */
  mapLocation: MapLocation | null;
  /**
   * Показывать мастера в поиске мини-аппа в Telegram (вкладка «Поиск»).
   * По умолчанию включено: выключает сам мастер в настройках страницы записи.
   */
  showInCatalog: boolean;
};

export const defaultBookingPageSettings: BookingPageSettings = {
  schemaVersion: 1,
  headline: "",
  subheadline: "",
  commentFieldMode: "optional",
  masterContact: "",
  giftCertificatesEnabled: false,
  giftCertificateDenominations: defaultGiftCertificateDenominations,
  giftCertificateNoExpiry: true,
  giftCertificateExpiryDate: null,
  socialLinks: emptySocialLinks,
  mapLocation: null,
  showInCatalog: true,
};

const denominationSchema = z.coerce
  .number()
  .int()
  .min(giftCertificateMinAmount)
  .max(giftCertificateMaxAmount);

/** Form input shape — what the settings form submits. */
export const bookingPageSettingsFormSchema = z.object({
  headline: z.string().trim().max(headlineMaxLength).default(""),
  subheadline: z.string().trim().max(subheadlineMaxLength).default(""),
  commentFieldMode: z.enum(commentFieldModes).default("optional"),
  masterContact: z.string().trim().max(masterContactMaxLength).default(""),
  // Чекбокс: браузер шлёт «on» или не шлёт поле вовсе.
  showInCatalog: z
    .union([z.literal("on"), z.literal("off"), z.boolean()])
    .transform((value) => value === "on" || value === true)
    .default(false),
});

export type BookingPageSettingsFormInput = z.infer<
  typeof bookingPageSettingsFormSchema
>;

const boolCheckboxSchema = z
  .union([z.literal("on"), z.literal("off"), z.boolean()])
  .transform((value) => value === "on" || value === true);

// Форма базовых настроек сертификатов (номиналы + срок действия) —
// отправляется отдельно от остальной витрины (свой раздел в кабинете), но
// живет в том же JSONB-блоке. Включение продажи (giftCertificatesEnabled)
// сюда намеренно не входит — это отдельное действие
// (updateCertificateSalesEnabledAction в actions/settings.ts) с
// собственной серверной проверкой на наличие дизайна шаблона (см.
// okno-tz-certificates-ui-flow.md, hard-gate).
//
// noExpiry/expiryDate — взаимоисключающие поля (чекбокс "без срока
// действия" по умолчанию включён). Не доверяем клиентской JS-логике,
// которая снимает чекбокс при выборе даты, — .refine ниже принудительно
// приводит их к согласованному виду на сервере.
export const giftCertificateSettingsFormSchema = z
  .object({
    denominations: z
      .array(denominationSchema)
      .min(1)
      .max(maxGiftCertificateDenominations),
    noExpiry: boolCheckboxSchema.default(true),
    expiryDate: z.string().trim().optional().default(""),
  })
  .transform((data) => {
    const hasExpiryDate = data.expiryDate.length > 0;
    return {
      ...data,
      noExpiry: hasExpiryDate ? false : data.noExpiry,
    };
  })
  .refine(
    (data) => {
      if (data.noExpiry || !data.expiryDate) {
        return true;
      }
      const parsed = DateTime.fromISO(data.expiryDate);
      return parsed.isValid && parsed > DateTime.now();
    },
    { message: "Дата окончания действия должна быть в будущем.", path: ["expiryDate"] },
  );

/** Lenient parse of whatever sits in the JSONB column. */
const storedSchema = z
  .object({
    headline: z.string().max(400).optional(),
    subheadline: z.string().max(800).optional(),
    commentFieldMode: z.enum(commentFieldModes).optional(),
    masterContact: z.string().max(400).optional(),
    giftCertificatesEnabled: z.boolean().optional(),
    giftCertificateDenominations: z.array(denominationSchema).optional(),
    giftCertificateNoExpiry: z.boolean().optional(),
    giftCertificateExpiryDate: z.string().nullable().optional(),
    socialLinks: z.record(z.string(), z.unknown()).optional(),
    mapLocation: z.unknown().optional(),
    showInCatalog: z.boolean().optional(),
  })
  .partial();

function normalizeStoredSocialLinks(raw: Record<string, unknown> | undefined): SocialLinks {
  const links = { ...emptySocialLinks };
  if (!raw) return links;
  for (const network of socialNetworks) {
    const value = raw[network];
    if (typeof value !== "string") continue;
    links[network] = normalizeSocialHandle(network, value) ?? "";
  }
  return links;
}

export function normalizeBookingPageSettings(raw: unknown): BookingPageSettings {
  let source: unknown = raw;

  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      source = {};
    }
  }

  const parsed = storedSchema.safeParse(source ?? {});
  const data = parsed.success ? parsed.data : {};

  const denominations = data.giftCertificateDenominations?.length
    ? Array.from(new Set(data.giftCertificateDenominations)).sort((a, b) => a - b)
    : defaultGiftCertificateDenominations;

  // Согласованность на чтение: если в строке (например, после ручной
  // правки в БД) есть дата окончания, "без срока действия" не может быть
  // истинным одновременно — дата побеждает.
  const expiryDate = data.giftCertificateExpiryDate?.trim() || null;
  const noExpiry = expiryDate ? false : (data.giftCertificateNoExpiry ?? true);

  return {
    schemaVersion: 1,
    headline: (data.headline ?? "").trim().slice(0, headlineMaxLength),
    subheadline: (data.subheadline ?? "").trim().slice(0, subheadlineMaxLength),
    commentFieldMode: data.commentFieldMode ?? defaultBookingPageSettings.commentFieldMode,
    masterContact: (data.masterContact ?? "").trim().slice(0, masterContactMaxLength),
    giftCertificatesEnabled: data.giftCertificatesEnabled ?? false,
    giftCertificateDenominations: denominations.slice(0, maxGiftCertificateDenominations),
    giftCertificateNoExpiry: noExpiry,
    giftCertificateExpiryDate: noExpiry ? null : expiryDate,
    socialLinks: normalizeStoredSocialLinks(data.socialLinks),
    mapLocation: data.mapLocation ? parseMapLocation(data.mapLocation) : null,
    showInCatalog: data.showInCatalog ?? true,
  };
}

export const commentFieldModeLabels: Record<CommentFieldMode, string> = {
  hidden: "Скрыть поле комментария",
  optional: "Поле комментария по желанию",
  required: "Комментарий обязателен",
};
