import { DateTime } from "luxon";
import { Tag } from "lucide-react";
import { formatCurrency, type Service } from "@/lib/mock-data";
import {
  applyDiscount,
  currentPeriodDiscount,
  type HotWindowsDiscount,
} from "@/lib/service-discounts";
import { cn } from "@/lib/utils";

// Цена услуги для клиента. Со скидкой — как привыкли в магазинах: старая цена
// зачёркнута, рядом процент, итоговая цена крупнее старой.
export function ServicePrice({
  price,
  discountPercent,
  size = "md",
  align = "end",
  className,
}: {
  price: number;
  discountPercent?: number | null;
  size?: "sm" | "md" | "lg";
  align?: "start" | "end";
  className?: string;
}) {
  const finalSize = { sm: "text-base", md: "text-xl", lg: "text-3xl" }[size];

  if (!discountPercent) {
    return <span className={cn("font-medium text-ink", className)}>{formatCurrency(price)}</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex flex-col gap-0.5 whitespace-nowrap",
        align === "end" ? "items-end text-right" : "items-start text-left",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="text-sm text-muted line-through decoration-1">{formatCurrency(price)}</span>
        <DiscountBadge percent={discountPercent} />
      </span>
      <span className={cn("font-semibold leading-tight tracking-[-0.02em] text-ink", finalSize)}>
        {formatCurrency(applyDiscount(price, discountPercent))}
      </span>
    </span>
  );
}

export function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-[var(--color-accent-deep)] px-2 py-0.5 text-xs font-semibold leading-4 text-ink-contrast",
        className,
      )}
    >
      −{percent}%
    </span>
  );
}

// Сегодняшняя дата в поясе мастера: акция привязана к датам визита у мастера.
export function masterTodayIso(timezone: string) {
  return DateTime.now().setZone(timezone).toISODate() ?? "";
}

// Цена услуги сегодня: с акцией, если она уже идёт.
export function todayPriceOf(service: Service, today: string) {
  const discount = currentPeriodDiscount(service, today);
  return discount && !discount.startsLater
    ? applyDiscount(service.price, discount.percent)
    : service.price;
}

// Цена в карточке услуги на странице мастера. Зачёркнутая цена — только для
// акции, что идёт сегодня: скидку на первый визит и на окошки получают не
// все, их подписываем строкой ниже (ServiceDiscountNotes).
export function ServiceCardPrice({ service, today }: { service: Service; today: string }) {
  const discount = currentPeriodDiscount(service, today);

  if (!discount || discount.startsLater) {
    return (
      <div
        className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-ink shadow-sm"
        style={{ backgroundColor: "var(--public-surface-strong)" }}
      >
        {formatCurrency(service.price)}
      </div>
    );
  }

  return (
    <ServicePrice
      price={service.price}
      discountPercent={discount.percent}
      size="lg"
      className="shrink-0"
    />
  );
}

export function ServiceDiscountNotes({ service, today }: { service: Service; today: string }) {
  const period = currentPeriodDiscount(service, today);
  const notes = [
    period
      ? period.startsLater
        ? `Акция −${period.percent}% ${period.label}`
        : `Акция ${period.label}`
      : null,
    service.firstVisitDiscountPercent
      ? `−${service.firstVisitDiscountPercent}% на первый визит`
      : null,
  ].filter(Boolean);

  if (notes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {notes.map((note) => (
        <span
          key={note}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent-deep)] px-3 py-1 text-xs font-medium text-accent-deep"
        >
          <Tag size={12} aria-hidden />
          {note}
        </span>
      ))}
    </div>
  );
}

// Плашка над услугами, пока у мастера включена скидка на горящие окошки.
export function HotWindowsDiscountBanner({
  discount,
  timezone,
  bookingHref,
}: {
  discount: HotWindowsDiscount;
  timezone: string;
  bookingHref?: string;
}) {
  // until — конец последнего дня окошек, показываем сам день.
  const untilLabel = DateTime.fromISO(discount.untilIso)
    .setZone(timezone)
    .setLocale("ru")
    .toFormat("d MMMM");
  const content = (
    <>
      <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-deep)] px-3 py-1.5 text-lg font-semibold leading-none text-ink-contrast">
        −{discount.percent}%
      </span>
      <span className="space-y-0.5">
        <span className="block text-base font-semibold text-ink">Горящие окошки со скидкой</span>
        <span className="block text-sm text-ink-soft">
          На свободное время до {untilLabel} включительно — на любую услугу
        </span>
      </span>
    </>
  );
  const className =
    "flex items-center gap-4 rounded-section border border-[var(--color-accent-deep)] bg-accent-soft px-5 py-4";

  return bookingHref ? (
    <a href={bookingHref} className={cn(className, "transition hover:shadow-card")}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}
