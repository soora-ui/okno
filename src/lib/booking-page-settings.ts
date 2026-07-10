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
  giftCertificatesEnabled: boolean;
  giftCertificateDenominations: number[];
};

export const defaultBookingPageSettings: BookingPageSettings = {
  schemaVersion: 1,
  headline: "",
  subheadline: "",
  commentFieldMode: "optional",
  giftCertificatesEnabled: false,
  giftCertificateDenominations: defaultGiftCertificateDenominations,
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
});

export type BookingPageSettingsFormInput = z.infer<
  typeof bookingPageSettingsFormSchema
>;

// Форма настроек сертификатов отправляется отдельно от остальной витрины
// (свой раздел в кабинете), но живет в том же JSONB-блоке.
export const giftCertificateSettingsFormSchema = z.object({
  giftCertificatesEnabled: z
    .union([z.literal("on"), z.literal("off"), z.boolean()])
    .transform((value) => value === "on" || value === true)
    .default(false),
  denominations: z
    .array(denominationSchema)
    .min(1)
    .max(maxGiftCertificateDenominations),
});

/** Lenient parse of whatever sits in the JSONB column. */
const storedSchema = z
  .object({
    headline: z.string().max(400).optional(),
    subheadline: z.string().max(800).optional(),
    commentFieldMode: z.enum(commentFieldModes).optional(),
    giftCertificatesEnabled: z.boolean().optional(),
    giftCertificateDenominations: z.array(denominationSchema).optional(),
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

  return {
    schemaVersion: 1,
    headline: (data.headline ?? "").trim().slice(0, headlineMaxLength),
    subheadline: (data.subheadline ?? "").trim().slice(0, subheadlineMaxLength),
    commentFieldMode: data.commentFieldMode ?? defaultBookingPageSettings.commentFieldMode,
    giftCertificatesEnabled: data.giftCertificatesEnabled ?? false,
    giftCertificateDenominations: denominations.slice(0, maxGiftCertificateDenominations),
  };
}

export const commentFieldModeLabels: Record<CommentFieldMode, string> = {
  hidden: "Скрыть поле комментария",
  optional: "Поле комментария по желанию",
  required: "Комментарий обязателен",
};
