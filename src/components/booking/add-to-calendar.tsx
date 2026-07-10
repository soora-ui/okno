import { CalendarPlus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import type { CalendarClientPlatform } from "@/lib/ics";

type AddToCalendarProps = {
  bookingId: string;
  platform: CalendarClientPlatform;
};

// Показываем обе опции всегда (простая эвристика по User-Agent решает
// только порядок/акцент): Apple-платформы обычно удобнее работают с
// .ics-файлом (открывается нативно в Calendar.app), остальные — с прямой
// ссылкой на Google Calendar, но клиент может выбрать любой вариант сам.
export function AddToCalendar({ bookingId, platform }: AddToCalendarProps) {
  const icsHref = `/api/calendar/${bookingId}?provider=ics`;
  const googleHref = `/api/calendar/${bookingId}?provider=google`;
  const icsIsPrimary = platform !== "google";

  return (
    <div className="flex flex-wrap justify-center gap-3">
      <ButtonLink
        href={icsIsPrimary ? icsHref : googleHref}
        documentNavigation
        variant={icsIsPrimary ? "primary" : "secondary"}
        className="gap-2"
      >
        <CalendarPlus size={16} />
        {icsIsPrimary ? "Добавить в календарь" : "Добавить в Google Calendar"}
      </ButtonLink>
      <ButtonLink
        href={icsIsPrimary ? googleHref : icsHref}
        documentNavigation
        variant="ghost"
        className="gap-2"
      >
        {icsIsPrimary ? "Или в Google Calendar" : "Скачать .ics"}
      </ButtonLink>
    </div>
  );
}
