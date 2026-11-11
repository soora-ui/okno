"use client";

import { ArrowRight, Briefcase, ChevronRight, Gift, MapPin, Search } from "lucide-react";
import { IdentityCard } from "@/app/tg/identity-card";
import { MasterAvatar } from "@/app/tg/master-avatar";
import { openExternal } from "@/app/tg/telegram";
import type { MiniAppBooking, MiniAppData, TabId } from "@/app/tg/types";
import { Button, ButtonLink } from "@/components/ui/button";

export function HomeTab({
  data,
  initData,
  onReload,
  onNavigate,
  onOpenCabinet,
  cabinetBusy,
}: {
  data: MiniAppData;
  initData: string;
  onReload: () => void;
  onNavigate: (tab: TabId) => void;
  onOpenCabinet: () => void;
  cabinetBusy: boolean;
}) {
  const [next, ...later] = data.bookings;
  const lastMaster = data.myMasters[0];
  const activeCertificates = data.certificates.filter(
    (certificate) => certificate.remainingRub > 0 && certificate.status !== "redeemed",
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">okno</p>
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
          {data.firstName ? `Привет, ${data.firstName}` : "Привет"}
        </h1>
      </header>

      {data.master ? (
        <button
          type="button"
          onClick={onOpenCabinet}
          disabled={cabinetBusy}
          className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-4 text-left transition active:scale-[0.99]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
            <Briefcase size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">Кабинет мастера</span>
            <span className="block truncate text-sm text-muted">
              {cabinetBusy ? "Открываю…" : "Записи, расписание и клиенты"}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </button>
      ) : null}

      {/* Первым делом — то, что горит: слот под предоплату держится 15 минут,
          и человек, вернувшийся с полдороги, должен увидеть это сразу. */}
      {data.pendingPayment.map((booking) => (
        <section
          key={booking.bookingId}
          className="rounded-card border bg-warning-soft p-5"
          style={{ borderColor: "var(--color-warning)" }}
        >
          <p className="text-sm font-medium text-warning">Ждём оплату</p>
          <p className="mt-2 font-semibold text-ink">{booking.serviceTitle}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {booking.masterName} · {booking.startsAtLabel}
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            Слот держится, пока не пройдёт предоплата {booking.amountRub} ₽.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => openExternal(booking.confirmationUrl)}
          >
            Оплатить {booking.amountRub} ₽
          </Button>
        </section>
      ))}

      {next ? (
        <NextVisit booking={next} />
      ) : (
        <section className="rounded-card border border-line bg-surface p-5">
          <p className="font-semibold text-ink">Ближайших записей нет</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {lastMaster
              ? `Последний визит — у мастера ${lastMaster.name}.`
              : "Найди мастера в своём городе и запишись в пару касаний."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {lastMaster ? (
              <ButtonLink href={lastMaster.repeatUrl} documentNavigation>
                Записаться снова
              </ButtonLink>
            ) : null}
            <Button
              variant={lastMaster ? "secondary" : "primary"}
              className="gap-2"
              onClick={() => onNavigate("search")}
            >
              <Search size={14} />
              Найти мастера
            </Button>
          </div>
        </section>
      )}

      {later.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader
            title="Дальше"
            action="Все визиты"
            onAction={() => onNavigate("visits")}
          />
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {later.slice(0, 3).map((booking) => (
              <li
                key={booking.bookingId}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <MasterAvatar
                  name={booking.masterName}
                  url={booking.masterAvatarUrl}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {booking.serviceTitle}
                  </p>
                  <p className="truncate text-xs text-muted">{booking.masterName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-ink">{booking.dayLabel}</p>
                  <p className="text-xs text-muted">{booking.timeLabel}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.myMasters.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title="Мои мастера" />
          {/* Лента уходит за край экрана: обрезанная карточка справа сама
              говорит, что список листается. */}
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {data.myMasters.map((master) => (
              <li
                key={master.username}
                className="flex w-40 shrink-0 snap-start flex-col rounded-card border border-line bg-surface p-4"
              >
                <a href={master.url} className="block">
                  <MasterAvatar name={master.name} url={master.avatarUrl} size={48} />
                  <p className="mt-3 truncate font-semibold text-ink">{master.name}</p>
                  <p className="truncate text-xs text-muted">
                    {master.specialty || master.lastServiceTitle}
                  </p>
                </a>
                <ButtonLink
                  href={master.repeatUrl}
                  variant="secondary"
                  className="mt-3 min-h-9 w-full px-3 py-2 text-[13px]"
                  documentNavigation
                >
                  Записаться
                </ButtonLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.hasIdentity ? null : <IdentityCard initData={initData} onLinked={onReload} />}

      <section className="grid grid-cols-2 gap-3">
        <Tile
          icon={<Search size={18} />}
          title="Найти мастера"
          subtitle="По городу и услуге"
          onClick={() => onNavigate("search")}
        />
        <Tile
          icon={<Gift size={18} />}
          title="Сертификаты"
          subtitle={
            activeCertificates.length > 0
              ? `Действует: ${activeCertificates.length}`
              : "Привязать по коду"
          }
          onClick={() => onNavigate("profile")}
        />
      </section>
    </div>
  );
}

// Ближайший визит — единственная чернильная поверхность на экране: то, ради
// чего приложение открывают чаще всего, должно читаться с первого взгляда.
function NextVisit({ booking }: { booking: MiniAppBooking }) {
  const place = [booking.city, booking.address].filter(Boolean).join(", ");

  return (
    <section className="rounded-card bg-[image:var(--gradient-ink)] p-5 text-white shadow-ink">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/60">
          Ближайший визит
        </p>
        <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-white">
          {booking.relativeLabel}
        </span>
      </div>

      <p className="mt-4 text-4xl font-semibold leading-none tracking-[-0.025em]">
        {booking.timeLabel}
      </p>
      <p className="mt-2 text-sm text-white/70">
        {booking.dayLabel}, {booking.weekdayLabel}
      </p>

      <div className="mt-5 flex items-center gap-3 border-t border-white/12 pt-4">
        <MasterAvatar
          name={booking.masterName}
          url={booking.masterAvatarUrl}
          size={44}
          className="border-white/20"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{booking.serviceTitle}</p>
          <p className="truncate text-sm text-white/70">{booking.masterName}</p>
        </div>
      </div>

      {place ? (
        <p className="mt-3 flex items-start gap-1.5 text-sm leading-5 text-white/70">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          {place}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {booking.cancelUrl ? (
          <a
            href={booking.cancelUrl}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-[#23241f] transition active:scale-[0.98]"
          >
            Перенести или отменить
          </a>
        ) : null}
        {booking.routeUrl ? (
          <button
            type="button"
            onClick={() => openExternal(booking.routeUrl as string)}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-white/25 px-5 text-sm font-medium text-white transition active:scale-[0.98]"
          >
            Маршрут
            <ArrowRight size={14} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-9 items-center gap-0.5 text-sm font-medium text-accent-deep"
        >
          {action}
          <ChevronRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

function Tile({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-card border border-line bg-surface p-4 text-left transition active:scale-[0.98]"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-panel text-ink">
        {icon}
      </span>
      <span className="mt-3 block text-sm font-semibold text-ink">{title}</span>
      <span className="block text-xs text-muted">{subtitle}</span>
    </button>
  );
}
