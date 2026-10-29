"use client";

import { ArrowRight, ImageIcon, MapPin } from "lucide-react";
import {
  BrandAvatarRing,
  BrandCardCorner,
  BrandCtaUnderlay,
  BrandDivider,
  BrandFooterDecor,
  BrandHeroDecor,
} from "@/components/brand-theme/brand-decor";
import { BrandThemeStyle } from "@/components/brand-theme/brand-theme-style";
import { publicThemeAttr } from "@/lib/brand-theme/attr";
import { brandLogoPath, decorFor } from "@/lib/brand-theme/decor";
import type { BrandTheme } from "@/lib/brand-theme/schema";
import { resolveProfileMediaUrl } from "@/lib/profile-media";
import { cn } from "@/lib/utils";

// Страница мастера в миниатюре для мастера стиля (4.8, 4.12, 4.13, 4.15).
// Это не копия настоящей страницы, а её силуэт той же структуры на тех же
// переменных темы: мгновенно перерисовывается при ручных правках и не
// грузит ничего лишнего. Настоящая страница — в превью (4.10), во фрейме.

export type MockMaster = {
  name: string;
  specialty: string;
  city: string;
  avatarUrl: string | null;
  services: { title: string; meta: string }[];
};

const screenWidth = 390;

export function PhoneMock({
  theme,
  scope,
  master,
  width = 300,
  height = 560,
  frame = true,
  className,
}: {
  theme: BrandTheme;
  scope: string;
  master: MockMaster;
  // Ширина экрана в px на странице; внутри страница всегда 390 и масштабируется.
  width?: number;
  height?: number;
  frame?: boolean;
  className?: string;
}) {
  const scale = width / screenWidth;
  const logo = resolveProfileMediaUrl(brandLogoPath(theme));
  const initials = master.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const screen = (
    <div
      aria-hidden="true"
      className="relative overflow-hidden"
      style={{ width, height, borderRadius: frame ? 38 * (width / 300) : 0 }}
    >
      <BrandThemeStyle theme={theme} scope={scope} />
      <div
        {...publicThemeAttr("linen", theme)}
        data-brand-scope={scope}
        className="pointer-events-none origin-top-left select-none"
        style={{
          width: screenWidth,
          minHeight: height / scale,
          transform: `scale(${scale})`,
          backgroundColor: "var(--color-background)",
        }}
      >
        <div className="flex flex-col gap-4 p-4">
          <div
            className="flex items-center justify-between rounded-full border px-3 py-2"
            style={{ backgroundColor: "var(--public-surface-strong)", borderColor: "var(--public-edge)" }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- PNG из profile-media
              <img src={logo} alt="" className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs text-ink-contrast">o</span>
                okno
              </span>
            )}
            <span data-ui-button="" className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: "var(--ui-primary-bg)", color: "var(--ui-primary-text)" }}>
              Записаться
            </span>
          </div>

          <section
            className="relative isolate flex flex-col gap-3 overflow-hidden rounded-section border p-5 shadow-section"
            style={{ backgroundColor: "var(--public-surface)", borderColor: "var(--public-edge)" }}
          >
            <BrandHeroDecor decor={decorFor(theme, "hero")} />
            <span className="self-start rounded-full px-3 py-1 text-[11px] font-medium" style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent-deep)" }}>
              Онлайн-запись
            </span>
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[32px] leading-[1.05] text-ink">{master.name}</h3>
              <span className="relative block h-[60px] w-[60px] shrink-0">
                <BrandAvatarRing decor={decorFor(theme, "avatar")} />
                {master.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- аватар мастера
                  <img src={master.avatarUrl} alt="" className="h-[60px] w-[60px] rounded-full border border-white/90 object-cover" />
                ) : (
                  <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full border border-white/90 bg-panel text-lg text-ink [font-family:var(--brand-font-heading)]">
                    {initials}
                  </span>
                )}
              </span>
            </div>
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              {master.specialty}
              <MapPin size={14} />
              {master.city}
            </p>
            <span className="relative isolate inline-flex self-start">
              <span className="absolute inset-0 -z-10">
                <BrandCtaUnderlay decor={decorFor(theme, "cta")} />
              </span>
              <span
                data-ui-button=""
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium"
                style={{ backgroundColor: "var(--ui-primary-bg)", color: "var(--ui-primary-text)" }}
              >
                Выбрать время
                <ArrowRight size={16} />
              </span>
            </span>
          </section>

          <section className="relative mt-8 flex flex-col gap-3">
            <BrandDivider decor={decorFor(theme, "dividers")} />
            <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted">Портфолио</span>
            <h3 className="text-2xl text-ink">Готовые работы</h3>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((index) => (
                <span
                  key={index}
                  className="flex aspect-square items-center justify-center border border-line text-muted"
                  style={{
                    borderRadius: "var(--brand-radius-image)",
                    backgroundColor: index === 0 ? "var(--color-accent-soft)" : "var(--color-panel)",
                  }}
                >
                  <ImageIcon size={22} />
                </span>
              ))}
            </div>
          </section>

          <section className="relative mt-8 flex flex-col gap-3">
            <BrandDivider decor={decorFor(theme, "dividers")} />
            <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted">Услуги</span>
            {master.services.slice(0, 2).map((service, index) => (
              <div
                key={service.title}
                className="relative overflow-hidden rounded-section border border-line p-5 shadow-card"
                style={{ backgroundColor: index % 2 === 0 ? "var(--ui-card-bg)" : "var(--color-accent-soft)" }}
              >
                <BrandCardCorner decor={decorFor(theme, "cards")} />
                <h3 className="text-xl text-ink">{service.title}</h3>
                <p className="mt-1 text-sm text-muted">{service.meta}</p>
              </div>
            ))}
          </section>

          <footer className="relative mt-6 border-t border-line pt-3 text-xs text-muted">
            <BrandFooterDecor decor={decorFor(theme, "footer")} />
            Создано в okno
          </footer>
        </div>
      </div>
    </div>
  );

  if (!frame) return <div className={className}>{screen}</div>;

  return (
    <div
      className={cn("shrink-0 rounded-[48px] border border-line p-2.5 shadow-hover", className)}
      style={{ backgroundColor: "#23241f", borderRadius: 48 * (width / 300) }}
    >
      {screen}
    </div>
  );
}
