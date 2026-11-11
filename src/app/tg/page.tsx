import type { Metadata } from "next";
import { MiniAppClient } from "@/app/tg/miniapp-client";

// Кабинет клиента внутри Telegram.
//
// Живёт на /tg, а не на /app или /кабинет: корневые сегменты конкурируют с
// динамическим [username], и чем короче и техничнее путь, тем меньше шанс,
// что мастер однажды займёт такой ник и потеряет свою страницу записи.
//
// Не индексируется: страница без подписи Telegram всё равно ничего не
// показывает, а в выдаче выглядела бы сломанной.
export const metadata: Metadata = {
  title: "okno",
  robots: { index: false, follow: false },
};

export default function TelegramMiniAppPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4">
      <MiniAppClient />
    </main>
  );
}
