"use client";

import { useCallback, useState } from "react";
import { Share2 } from "lucide-react";
import { PhoneVerify } from "@/app/tg/phone-verify";
import { getWebApp, hapticSuccess } from "@/app/tg/telegram";
import { Button } from "@/components/ui/button";

// Подтверждение номера. Пока его нет, приложение знает только те записи,
// которые человек сам подключил ссылкой, — ни истории, ни сертификатов.
export function IdentityCard({
  initData,
  onLinked,
}: {
  initData: string;
  onLinked: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // Просим номер прямо из мини-аппа. Метод появился не сразу, поэтому если
  // его нет — честно отправляем в чат, где есть кнопка под полем ввода.
  const requestContact = useCallback(() => {
    const webApp = getWebApp();

    if (!webApp?.requestContact) {
      setUnsupported(true);
      return;
    }

    setSharing(true);

    webApp.requestContact((shared) => {
      setSharing(false);

      if (!shared) {
        return;
      }

      hapticSuccess();
      // Контакт уходит боту отдельным сообщением, и личность появляется не
      // мгновенно. Перечитываем с небольшой задержкой.
      setTimeout(onLinked, 1200);
    });
  }, [onLinked]);

  return (
    <section className="space-y-3 rounded-card border border-line bg-accent-soft p-5">
      <div className="space-y-1">
        <h2 className="font-semibold text-ink">Покажу все твои визиты</h2>
        <p className="text-sm leading-6 text-ink-soft">
          Поделись номером — и здесь появятся записи у всех мастеров okno, история
          визитов и сертификаты.
        </p>
      </div>
      <Button onClick={requestContact} disabled={sharing} className="w-full gap-2">
        <Share2 size={14} />
        {sharing ? "Ждём номер…" : "Поделиться номером"}
      </Button>
      {unsupported ? (
        <p className="text-sm leading-6 text-ink-soft">
          Твоя версия Telegram не умеет делиться номером отсюда. Напиши боту в чат — там
          под полем ввода будет кнопка «Показать все мои записи».
        </p>
      ) : null}

      {/* Номер в Telegram и номер, на который человек записывался, — разные
          вещи. Без этого пути у владельца двух номеров кабинет остаётся
          пустым, а кнопка контакта ему не поможет. */}
      {showPhoneVerify ? (
        <PhoneVerify
          initData={initData}
          onVerified={() => {
            setShowPhoneVerify(false);
            onLinked();
          }}
        />
      ) : (
        <Button variant="ghost" onClick={() => setShowPhoneVerify(true)} className="w-full">
          Записывался на другой номер
        </Button>
      )}
    </section>
  );
}
