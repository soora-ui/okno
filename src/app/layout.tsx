import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { BookingThemeStyles } from "@/components/booking/booking-theme-styles";
import { siteDescription, siteName, siteTitle, siteUrl } from "@/config/site";
import "./globals.css";

// Manrope — переменный шрифт (200–800), поэтому weight не указываем: одного
// файла хватает на все используемые начертания (400/500/600). Кириллица нужна
// обязательно — интерфейс русскоязычный. Переменная подставляется первой в
// стек --font-manrope в globals.css.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope-loaded",
  display: "swap",
});

// viewport-fit=cover обязателен, иначе env(safe-area-inset-*) на iOS всегда
// равен нулю и нижняя панель кабинета садится вплотную к домашнему индикатору.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// openGraph страницы заменяет этот целиком, а не дополняет: страницы со своим
// og:title повторяют siteName, locale и type сами. Картинку Next подставляет
// из opengraph-image.tsx для всех вложенных маршрутов.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  applicationName: siteName,
  openGraph: {
    siteName,
    locale: "ru_RU",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`h-full antialiased ${manrope.variable}`}
      data-scroll-behavior="smooth"
    >
      <head>
        <BookingThemeStyles />
        {/* Блоки появления рендерятся скрытыми и раскрываются на клиенте.
            Без JS раскрывать было бы некому — контент есть в разметке, но
            невидим. Стиль применяется только при отключённом скриптинге,
            поэтому обычным посетителям он не мешает и мигания не даёт. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important;filter:none!important;border-radius:inherit!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
