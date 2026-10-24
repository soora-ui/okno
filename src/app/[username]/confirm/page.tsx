import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ReminderChannels } from "@/components/booking/reminder-channels";
import { SiteShell } from "@/components/layout/site-shell";
import { TipForm } from "@/components/booking/tip-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandThemeStyle } from "@/components/brand-theme/brand-theme-style";
import { publicThemeAttr } from "@/lib/brand-theme/attr";
import { getBookingConfirmationData } from "@/lib/data";
import { isTelegramBotConfigured } from "@/lib/env";
import { detectCalendarPlatformFromUserAgent } from "@/lib/ics";
import { isTipAllowed } from "@/lib/tips";

// Служебная страница: в выдаче не нужна.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

type ConfirmPageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{
    bookingId?: string;
    cancelToken?: string;
  }>;
};

export default async function ConfirmPage({
  params,
  searchParams,
}: ConfirmPageProps) {
  const { username } = await params;
  const query = await searchParams;
  const bookingId =
    typeof query.bookingId === "string" ? query.bookingId : "";
  const cancelToken =
    typeof query.cancelToken === "string" ? query.cancelToken : "";
  const booking = await getBookingConfirmationData(username, bookingId);

  if (!booking) {
    notFound();
  }

  const requestHeaders = await headers();
  const calendarPlatform = detectCalendarPlatformFromUserAgent(
    requestHeaders.get("user-agent"),
  );

  // Предоплата (Модуль 2, okno-tz-rating-prepayment.md): клиент возвращается
  // сюда сразу после ЮKassa, вебхук мог еще не долететь. Показываем статус
  // по факту записи, а не всегда "подтверждена".
  const isPendingPayment = booking.status === "pending_payment";
  const isCancelled =
    booking.status === "cancelled_by_client" || booking.status === "cancelled_by_master";

  const heading = isPendingPayment
    ? "Ждём подтверждения оплаты"
    : isCancelled
      ? "Запись отменена"
      : "Запись подтверждена";

  // Чаевые — только за состоявшийся визит: не отменённая, не pending_payment
  // и уже начавшаяся запись (почему именно так — в isTipAllowed). Это лишь UI:
  // ту же проверку делает startTipPayment на сервере.
  const canTip =
    !isCancelled &&
    !isPendingPayment &&
    Boolean(booking.bookingId) &&
    isTipAllowed({ status: booking.status, startsAtIso: booking.startsAtIso });

  const description = isPendingPayment
    ? `${booking.clientName}, мы получили запрос на оплату предоплаты. Как только ЮKassa подтвердит платёж, запись станет подтверждённой — обнови страницу через минуту.`
    : isCancelled
      ? `${booking.clientName}, эта запись больше не активна. Если это неожиданно — свяжись с мастером.`
      : `${booking.clientName}, запись принята. Сохрани это время, чтобы не потерять его.`;

  return (
    <SiteShell compact hideGuestMenu resolveAuth={false} showSupportWidget={false}>
      <div
        {...publicThemeAttr(booking.themePresetId, booking.brandTheme)}
        className="mx-auto max-w-3xl py-10"
      >
        <BrandThemeStyle theme={booking.brandTheme} />
        <div
          className="rounded-section p-4 sm:p-6"
          style={{
            backgroundImage:
              "radial-gradient(circle at top left, var(--public-glow-a), transparent 30%), radial-gradient(circle at 80% 20%, var(--public-glow-b), transparent 24%), radial-gradient(circle at bottom right, var(--public-glow-c), transparent 32%)",
          }}
        >
          <Card className="space-y-6 text-center">
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
                isCancelled ? "bg-danger-soft" : isPendingPayment ? "bg-warning-soft" : "bg-success-soft"
              }`}
            >
              {isCancelled ? (
                <XCircle size={28} className="text-danger" />
              ) : isPendingPayment ? (
                <Clock size={28} className="text-warning" />
              ) : (
                <CheckCircle2 size={28} className="text-success" />
              )}
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold text-ink">{heading}</h1>
              <p className="text-sm leading-7 text-ink-soft">{description}</p>
            </div>
            <div className="rounded-card bg-panel p-5 text-left">
              <p className="font-medium text-ink">{booking.serviceTitle}</p>
              <p className="mt-2 text-sm text-ink-soft">{booking.startsAtLabel}</p>
              {isPendingPayment ? (
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-warning">
                  Слот придержан на 15 минут под оплату
                </p>
              ) : null}
            </div>
            {booking.bookingId ? (
              <ReminderChannels
                bookingId={booking.bookingId}
                platform={calendarPlatform}
                telegramAvailable={isTelegramBotConfigured}
              />
            ) : null}
            {canTip ? <TipForm bookingId={booking.bookingId} /> : null}
            <div className="flex flex-wrap justify-center gap-3">
              {cancelToken && !isCancelled ? (
                <ButtonLink href={`/cancel/${cancelToken}`} variant="secondary">
                  Перенести или отменить
                </ButtonLink>
              ) : null}
              <ButtonLink href={`/${username}`}>Вернуться к мастеру</ButtonLink>
            </div>
          </Card>
        </div>
      </div>
    </SiteShell>
  );
}
