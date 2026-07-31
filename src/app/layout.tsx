import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { BookingThemeStyles } from "@/components/booking/booking-theme-styles";
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

export const metadata: Metadata = {
  title: "okno",
  description:
    "Минималистичный сервис онлайн-записи для начинающих мастеров маникюра и бровей.",
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
