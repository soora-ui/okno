import { z } from "zod";
import {
  brandDecorStyles,
  brandFontIds,
  brandShadowLevels,
  brandThemeSchema,
  type BrandTheme,
} from "@/lib/brand-theme/schema";

// Промпт и схема ответа для генерации фирменного стиля (ТЗ 4.7–4.8).
// Модель получает материалы мастера и возвращает три варианта темы.
//
// Схема ответа намеренно свободнее brandThemeSchema: структурированный
// вывод API не поддерживает min/max и ограничения строк, а SDK, вырезав
// их, проверял бы их сам и падал на первом же радиусе 1000. Поэтому здесь
// — только типы и перечисления, а нормализация и строгая проверка идут
// следом в normalizeGeneratedTheme.

export const brandMoods = [
  "Нежно",
  "Дерзко",
  "Минимализм",
  "Люкс",
  "Натурально",
  "Ярко",
  "Строго",
  "Винтаж",
] as const;

export type BrandMood = (typeof brandMoods)[number];

export type BrandThemeBrief = {
  // Профиль мастера — чтобы стиль подходил к нише (барбер и бровист разные).
  specialty: string;
  workspaceName: string;
  // Шаг 2b.
  hexColors: string[];
  colorWords: string;
  moods: BrandMood[];
  // Шаг 4.
  wishes: string;
  // Перегенерация: что не понравилось в прошлый раз.
  regenerationComment?: string;
};

const colorRole = z.string().describe("Цвет в формате #rrggbb");

const generatedVariantSchema = z.object({
  name: z.string().describe("Короткое название варианта, 2–4 слова, по-русски"),
  explanation: z
    .string()
    .describe("Одно предложение по-русски: чем вариант отличается от двух других"),
  scheme: z.enum(["light", "dark"]),
  colors: z.object({
    background: colorRole.describe("Фон страницы"),
    card: colorRole.describe("Фон карточек"),
    panel: colorRole.describe("Плашки, подложки аватара, нейтральные чипы"),
    ink: colorRole.describe("Основной текст и заголовки"),
    inkSoft: colorRole.describe("Описания"),
    muted: colorRole.describe("Подписи и второстепенный текст"),
    line: colorRole.describe("Тонкие границы карточек"),
    accent: colorRole.describe("Акцент бренда"),
    accentSoft: colorRole.describe("Светлая (или у тёмной темы — приглушённая) подложка акцента"),
    accentDeep: colorRole.describe("Насыщенный акцент для текста на accentSoft"),
    button: colorRole.describe("Фон главной кнопки «Записаться»"),
    buttonText: colorRole.describe("Текст на главной кнопке"),
    secondary: colorRole.describe("Фон второстепенных кнопок"),
    decor1: colorRole.describe("Основной цвет декора"),
    decor2: colorRole.describe("Второй цвет декора"),
  }),
  headingFont: z.enum(brandFontIds),
  bodyFont: z.enum(brandFontIds),
  headingWeight: z.number().int().describe("400–800"),
  headingTracking: z.number().describe("Разрядка заголовков в em, от -0.05 до 0.2"),
  radiusCard: z.number().int().describe("Скругление карточек в px, 0–40"),
  radiusButton: z.number().int().describe("Скругление кнопок в px, 0–40 или 999 для пилюли"),
  radiusImage: z.number().int().describe("Скругление фото в px, 0–40"),
  shadow: z.enum(brandShadowLevels),
  decor: z.enum(brandDecorStyles),
});

export const generatedPalettesSchema = z.object({
  foundColors: z
    .array(z.string())
    .describe("Цвета #rrggbb, которые ты нашёл в материалах мастера, по убыванию важности"),
  foundFonts: z
    .array(z.string())
    .describe("Шрифты, которые ты узнал в материалах (как они называются), или пустой список"),
  fontNote: z
    .object({
      sourceFont: z.string().describe("Шрифт из брендбука"),
      replacement: z.enum(brandFontIds),
      reason: z.string().describe("Почему заменили, одним коротким предложением по-русски"),
    })
    .nullable()
    .describe("Заполни, если в материалах есть шрифт не из списка доступных"),
  variants: z.array(generatedVariantSchema).describe("Ровно три варианта"),
});

export type GeneratedPalettes = z.infer<typeof generatedPalettesSchema>;
export type GeneratedVariant = z.infer<typeof generatedVariantSchema>;

export const brandThemeSystemPrompt = `Ты — дизайнер, который переносит существующий бренд бьюти-мастера или студии на его страницу онлайн-записи в сервисе okno.

Что ты делаешь. Мастер прислал то, что у него есть: брендбук, логотип, скриншоты своего канала или бота, фото вывески и упаковки, свои цвета, слова о настроении. По этим материалам ты собираешь три варианта темы для его публичной страницы. Тема — это только оформление: палитра, два шрифта, скругления, тени и стиль декора. Структура страницы, порядок блоков и процесс записи у всех мастеров одинаковые, их ты не меняешь и не описываешь.

Главное — узнаваемость. Мастер должен открыть превью и сказать «это же мой бренд». Бери цвета из материалов, а не придумывай свои. Если в материалах один яркий фирменный цвет, он становится акцентом и кнопкой, а фон — спокойный оттенок, который с ним дружит. Если материалов мало, опирайся на слова мастера, настроение и нишу.

Чем различаются три варианта. Все три — один и тот же бренд. Первый максимально близок к материалам. Второй — та же палитра, но контрастнее и смелее (например, тёмный фон или насыщенная кнопка). Третий — мягче и спокойнее (больше воздуха, приглушённые тона). Не делай три почти одинаковых варианта.

Роли цветов:
- background — фон всей страницы; card — карточки поверх него; panel — нейтральные плашки.
- ink, inkSoft, muted — три уровня текста, от главного к второстепенному.
- line — тонкие границы, чуть темнее (на тёмной теме — чуть светлее) карточек.
- accent, accentSoft, accentDeep — акцент бренда, его мягкая подложка и насыщенный вариант для текста на подложке.
- button и buttonText — главная кнопка «Записаться», самый заметный элемент страницы.
- secondary — фон второстепенных кнопок.
- decor1, decor2 — цвета декоративных рисунков.

Читаемость обязательна: текст на любом фоне должен иметь контраст не ниже 4.5:1 (WCAG AA). Особенно ink на background и card, buttonText на button, accentDeep на accentSoft. Если цвет бренда сам по себе светлый, кнопку делай из него, а buttonText — тёмным.

scheme: "dark", если фон тёмный (как у барбершопа на чёрном), иначе "light".

Шрифты. Доступны только шрифты из перечисления, все с кириллицей: manrope, inter, montserrat, nunito, jost, rubik — гротески; cormorant-garamond, playfair-display, lora, pt-serif — антиквы; unbounded, comfortaa — акцидентные; caveat — рукописный. Если в брендбуке другой шрифт (часто платный или без кириллицы), подбери ближайший по характеру и заполни fontNote. Рукописный caveat годится только для заголовков. Для основного текста выбирай спокойный гротеск или антикву.

Декор — стиль из нашей библиотеки рисунков: botanical (листья, веточки — нейл, брови, спа, натуральное), geometric (линии, ромбы — барбершоп, строгий люкс), brush (мазки кистью — яркое, дерзкое, визаж), none (без декора — минимализм). Рисунки сами ты не создаёшь, только выбираешь стиль и цвета.

Скругления: строгий и мужской бренд — 2–8px, мягкий и женственный — 20–32px, кнопки-пилюли — 999. Тени: none для плоского минимализма, soft по умолчанию, deep для тёмных и объёмных тем.

Название и пояснение варианта пиши по-русски, коротко и по делу, обращаясь к мастеру на «вы». Без слов «идеальный», «уникальный», «премиальный».`;

/** Текстовая часть запроса: всё, что мастер написал, а не загрузил. */
export function buildBrandThemeBriefText(brief: BrandThemeBrief): string {
  const lines = [
    `Мастер: ${brief.specialty || "бьюти-мастер"}${brief.workspaceName ? `, «${brief.workspaceName}»` : ""}.`,
  ];

  if (brief.hexColors.length > 0) {
    lines.push(`Цвета бренда, которые мастер указал кодом: ${brief.hexColors.join(", ")}.`);
  }
  if (brief.colorWords.trim()) {
    lines.push(`Как мастер описывает свои цвета: «${brief.colorWords.trim()}».`);
  }
  if (brief.moods.length > 0) {
    lines.push(`Настроение: ${brief.moods.join(", ")}.`);
  }
  if (brief.wishes.trim()) {
    lines.push(`Пожелания к странице: «${brief.wishes.trim()}».`);
  }
  if (brief.regenerationComment?.trim()) {
    lines.push(
      `Это повторная генерация. Что мастеру не понравилось в прошлых вариантах: «${brief.regenerationComment.trim()}». Учти это.`,
    );
  }

  lines.push("Собери три варианта темы по материалам выше.");
  return lines.join("\n");
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function normalizeHex(value: string): string | null {
  const raw = value.trim().toLowerCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(raw);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const full = /^#?([0-9a-f]{6})$/.exec(raw);
  return full ? `#${full[1]}` : null;
}

export function normalizeHexList(values: string[]): string[] {
  return values
    .map(normalizeHex)
    .filter((value): value is string => value !== null);
}

/**
 * Ответ модели → строгая BrandTheme. Числа приводятся в допустимые рамки,
 * цвета — к #rrggbb. Вариант с нераспознанным цветом отбрасывается целиком:
 * подставлять туда наш цвет значило бы показать мастеру чужую палитру.
 */
export function normalizeGeneratedTheme(variant: GeneratedVariant): BrandTheme | null {
  const colors: Record<string, string> = {};
  for (const [role, value] of Object.entries(variant.colors)) {
    const hex = normalizeHex(value);
    if (!hex) return null;
    colors[role] = hex;
  }

  const button = Math.round(variant.radiusButton);
  const parsed = brandThemeSchema.safeParse({
    version: 1,
    scheme: variant.scheme,
    colors,
    fonts: {
      heading: variant.headingFont,
      // Рукописный шрифт основным текстом не читается.
      body: variant.bodyFont === "caveat" ? "nunito" : variant.bodyFont,
      headingWeight: clamp(Math.round(variant.headingWeight / 100) * 100, 400, 800),
      headingTracking: clamp(Number(variant.headingTracking.toFixed(3)), -0.05, 0.2),
    },
    radius: {
      card: clamp(Math.round(variant.radiusCard), 0, 40),
      button: button > 40 ? 999 : clamp(button, 0, 40),
      image: clamp(Math.round(variant.radiusImage), 0, 40),
    },
    shadow: variant.shadow,
    decor: variant.decor,
  });

  return parsed.success ? parsed.data : null;
}
