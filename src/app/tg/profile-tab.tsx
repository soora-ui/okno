"use client";

import { Briefcase, ChevronRight, CircleCheck, MessageCircle } from "lucide-react";
import { Certificates } from "@/app/tg/certificates";
import { IdentityCard } from "@/app/tg/identity-card";
import type { MiniAppData } from "@/app/tg/types";

export function ProfileTab({
  data,
  initData,
  onReload,
  onOpenCabinet,
  cabinetBusy,
}: {
  data: MiniAppData;
  initData: string;
  onReload: () => void;
  onOpenCabinet: () => void;
  cabinetBusy: boolean;
}) {
  const visits = data.bookings.length + data.past.length;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full border border-line bg-accent-soft text-2xl font-semibold text-accent-deep">
          {(data.firstName ?? "•").charAt(0).toLocaleUpperCase("ru")}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-[-0.025em] text-ink">
            {data.firstName ?? "Профиль"}
          </h1>
          {data.hasIdentity ? (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CircleCheck size={14} />
              Номер подтверждён
            </p>
          ) : (
            <p className="text-sm text-muted">Номер не подтверждён</p>
          )}
        </div>
      </header>

      {data.hasIdentity ? (
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Визиты" value={visits} />
          <Stat label="Мастера" value={data.myMasters.length} />
          <Stat label="Отзывы" value={data.reviews.length} />
        </dl>
      ) : (
        <IdentityCard initData={initData} onLinked={onReload} />
      )}

      {data.hasIdentity ? (
        <Certificates
          initData={initData}
          certificates={data.certificates}
          onClaimed={onReload}
        />
      ) : null}

      <section className="overflow-hidden rounded-card border border-line bg-surface">
        {data.master ? (
          <Row
            icon={<Briefcase size={18} />}
            title="Кабинет мастера"
            subtitle={cabinetBusy ? "Открываю…" : data.master.name}
            onClick={onOpenCabinet}
            disabled={cabinetBusy}
          />
        ) : (
          <Row
            icon={<Briefcase size={18} />}
            title="Я мастер"
            subtitle="Онлайн-запись для своих клиентов"
            href="/"
          />
        )}
        <Row
          icon={<MessageCircle size={18} />}
          title="Напоминания"
          subtitle="Приходят в чат с ботом. Отключить — команда /stop"
        />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-panel border border-line bg-surface px-3 py-3 text-center">
      <dd className="text-xl font-semibold leading-none text-ink">{value}</dd>
      <dt className="mt-1.5 text-xs text-muted">{label}</dt>
    </div>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onClick,
  href,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-panel text-ink">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs leading-5 text-muted">{subtitle}</span>
      </span>
      {onClick || href ? <ChevronRight size={18} className="shrink-0 text-muted" /> : null}
    </>
  );
  const className =
    "flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0";

  if (href) {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
