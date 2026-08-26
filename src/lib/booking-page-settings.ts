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
  })
  .partial();

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
  };
}

export const commentFieldModeLabels: Record<CommentFieldMode, string> = {
  hidden: "Скрыть поле комментария",
  optional: "Поле комментария по желанию",
  required: "Комментарий обязателен",
};
