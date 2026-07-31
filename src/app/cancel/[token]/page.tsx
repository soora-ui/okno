import { notFound } from "next/navigation";
import { Ban, CalendarX2, CheckCircle2 } from "lucide-react";
import { ClientCancellationForm } from "@/components/forms/client-cancellation-form";
import { ClientRescheduleForm } from "@/components/forms/client-reschedule-form";
import { SiteShell } from "@/components/layout/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBookingCancellationData } from "@/lib/data";

type CancelBookingPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{
    updated?: string;
  }>;
};

export default async function CancelBookingPage({
  params,
  searchParams,
}: CancelBookingPageProps) {
  const { token } = await params;
  const query = await searchParams;
  const booking = await getBookingCancellationData(token);

  if (!booking) {
    notFound();
  }

  const isAlreadyCancelled = booking.status !== "confirmed";

  return (
    <SiteShell compact hideGuestMenu resolveAuth={false}>
      <div className="mx-auto max-w-3xl py-10">
        <Card className="space-y-6 text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              backgroundColor: isAlreadyCancelled
                ? "var(--color-panel)"
                : "var(--color-warning-soft)",
            }}
          >
            {isAlreadyCancelled ? (
              <CheckCircle2 size={28} className="text-success" />
            ) : booking.canCancel ? (
              <CalendarX2 size={28} className="text-warning" />
            ) : (
              <Ban size={28} className="text-warning" />
            )}
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-semibold text-ink">
              {isAlreadyCancelled
                ? "Запись уже не активна"
                : booking.canCancel
                  ? "Управление записью"
                  : "Срок отмены прошел"}
            </h1>
            <p className="text-sm leading-7 text-ink-soft">
              {isAlreadyCancelled
                ? "Эта запись уже отменена и больше не занимает слот у мастера."
                : booking.canCancel
                  ? "Если планы поменялись, можно перенести или отменить визит по этой защищенной ссылке."
                  : "Самостоятельная отмена уже закрыта. Лучше свяжись с мастером напрямую, чтобы договориться."}
            </p>
          </div>

          {query.updated === "1" ? (
            <div className="rounded-panel bg-success-soft px-4 py-3 text-sm text-success">
              Запись перенесена. Ниже уже показаны новые дата и время визита.
            </div>
          ) : null}

          <div className="rounded-card bg-panel p-5 text-left">
            <p className="font-medium text-ink">{booking.serviceTitle}</p>
            <p className="mt-2 text-sm text-ink-soft">{booking.startsAtLabel}</p>
            <p className="mt-2 text-sm text-ink-soft">Мастер: {booking.masterName}</p>
            <p className="mt-2 text-sm text-ink-soft">Клиент: {booking.clientName}</p>
            {booking.cancellationDeadlineLabel && booking.status === "confirmed" ? (
              <p className="mt-3 text-sm text-muted">
                Отменить можно до {booking.cancellationDeadlineLabel}.
              </p>
            ) : null}
          </div>

          {!isAlreadyCancelled && booking.canCancel ? (
            <div className="grid gap-6 text-left lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-card border border-line bg-surface p-5">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-ink">Перенести запись</h2>
                  <p className="text-sm leading-6 text-ink-soft">
                    Выбери новый свободный слот. Старое время освободится сразу после переноса.
                  </p>
                </div>
                <ClientRescheduleForm
                  cancellationToken={booking.cancellationToken}
                  bookingSlots={booking.bookingSlots}
                />
              </div>

              <div className="space-y-4 rounded-card border border-line bg-surface p-5">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-ink">Отменить запись</h2>
                  <p className="text-sm leading-6 text-ink-soft">
                    Если визит уже не нужен, можно освободить слот для других клиентов.
                  </p>
                </div>
                <ClientCancellationForm cancellationToken={booking.cancellationToken} />
              </div>
            </div>
          ) : !isAlreadyCancelled ? (
            <ClientCancellationForm
              cancellationToken={booking.cancellationToken}
              disabled
            />
          ) : null}

          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href={`/${booking.username}`} variant="secondary">
              Открыть страницу мастера
            </ButtonLink>
          </div>
        </Card>
      </div>
    </SiteShell>
  );
}
