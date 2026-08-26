import { CalendarPlus, Send } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import type { CalendarClientPlatform } from "@/lib/ics";

type ReminderChannelsProps = {
  bookingId: string;
  platform: CalendarClientPlatform;
  telegramAvailable: boolean;
};

// Два канала напоминаний рядом, потому что они делают разное.
//
// Календарь срабатывает локально: без интернета, без спама, и никуда не
// денется. Но он односторонний — если мастер отменит визит, сохранённое
// событие об этом не узнает. Telegram знает, но требует нажать кнопку.
//
// SMS здесь нет намеренно: у sms.ru нет бесплатного отправителя, имя
// подключается к каждому оператору за абонплату (docs/sms-setup.md).
export function ReminderChannels({
  bookingId,
  platform,
  telegramAvailable,
}: ReminderChannelsProps) {
  const icsHref = `/api/calendar/${bookingId}?provider=ics`;
  const googleHref = `/api/calendar/${bookingId}?provider=google`;
  const calendarIsIcs = platform !== "google";
  const calendarHref = calendarIsIcs ? icsHref : googleHref;
  const calendarAlternativeHref = calendarIsIcs ? googleHref : icsHref;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-center gap-3">
        {telegramAvailable ? (
          <ButtonLink
            href={`/api/telegram/client-link/${bookingId}`}
            documentNavigation
            className="gap-2"
          >
            <Send size={16} />
            Напоминать в Telegram
          </ButtonLink>
        ) : null}
        <ButtonLink
          href={calendarHref}
          documentNavigation
          variant={telegramAvailable ? "secondary" : "primary"}
          className="gap-2"
        >
          <CalendarPlus size={16} />
          {calendarIsIcs ? "Добавить в календарь" : "Добавить в Google Calendar"}
        </ButtonLink>
      </div>
      <div className="space-y-1 text-center text-sm text-muted">
        {telegramAvailable ? (
          <p>Напомним заранее и предупредим, если мастер отменит визит</p>
        ) : null}
        <p>
          <ButtonLink
            href={calendarAlternativeHref}
            documentNavigation
            variant="ghost"
            className="h-auto px-0 py-0 text-sm font-normal text-muted"
          >
            {calendarIsIcs ? "Или в Google Calendar" : "Скачать .ics"}
          </ButtonLink>
        </p>
      </div>
    </div>
  );
}
