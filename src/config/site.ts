// Канонический адрес и описание продукта для поиска: метаданные, robots,
// sitemap, JSON-LD и llms.txt берут их отсюда, чтобы домен и формулировки
// не разъезжались между файлами.
export const siteUrl = "https://okno.business";

export const siteName = "okno";

export const siteTitle = "Онлайн-запись для мастеров и салонов красоты — okno";

export const siteDescription =
  "Клиенты записываются сами по ссылке, а вы видите весь день. Напоминания, предоплата, база клиентов. Первый месяц бесплатно, дальше от 690 ₽.";

// Общая OG-картинка из src/app/opengraph-image.tsx. Next подставляет её сам,
// пока страница не задаёт свой openGraph: тогда images надо передать явно,
// иначе превью в Telegram и VK останется без картинки.
export const defaultOgImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "okno — онлайн-запись для мастеров и салонов красоты",
};
