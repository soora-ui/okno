import { BrandThemeStyle } from "@/components/brand-theme/brand-theme-style";
import { BrandAvatarRing, BrandCtaUnderlay } from "@/components/brand-theme/brand-decor";
import { bookingThemeAttr, type BookingThemePresetId } from "@/lib/booking-theme-presets";
import { publicThemeAttr } from "@/lib/brand-theme/attr";
import type { BrandTheme } from "@/lib/brand-theme/schema";
import { cn } from "@/lib/utils";

// Миниатюра телефона со страницей мастера для карточки «Фирменный стиль»
// (макет 4.0, 128×236). Это не уменьшенная копия настоящей страницы —
// такая весила бы как сама страница, — а её силуэт на тех же переменных
// темы: шапка, имя заголовочным шрифтом, аватар с рамкой, кнопка, услуги.
//
// На одной странице настроек может быть только одна фирменная миниатюра:
// CSS темы висит на общем селекторе [data-booking-theme="brand"].
export function BrandMiniPreview({
  theme,
  presetId = "linen",
  name,
  locked = false,
  className,
}: {
  theme: BrandTheme | null;
  presetId?: BookingThemePresetId;
  name: string;
  locked?: boolean;
  className?: string;
}) {
  const attr = theme
    ? publicThemeAttr(presetId, theme)
    : { ...bookingThemeAttr(presetId), "data-booking-theme-mode": "light" };
  const decor = theme?.decor ?? null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative h-[236px] w-[128px] shrink-0 overflow-hidden rounded-[22px] border border-line",
        className,
      )}
    >
      <BrandThemeStyle theme={theme} />
      <div
        {...attr}
        className="flex h-full flex-col gap-2 p-2.5"
        style={{ backgroundColor: "var(--color-background)" }}
      >
        <div
          className="h-3 rounded-full border"
          style={{
            backgroundColor: "var(--public-surface-strong)",
            borderColor: "var(--color-line)",
          }}
        />
        <div
          className="relative isolate space-y-2 overflow-hidden rounded-card border p-2.5"
          style={{
            backgroundColor: "var(--public-surface)",
            borderColor: "var(--color-line)",
          }}
        >
          <div className="flex items-start justify-between gap-1.5">
            <p className="text-[15px] leading-none text-ink [font-family:var(--brand-font-heading,inherit)]">
              {name}
            </p>
            <span className="relative block h-6 w-6 shrink-0">
              <BrandAvatarRing decor={decor} />
              <span className="block h-6 w-6 rounded-full bg-panel" />
            </span>
          </div>
          <span className="block h-1.5 w-14 rounded-full bg-panel" />
          <span className="relative isolate inline-flex">
            <span className="absolute inset-0 -z-10">
              <BrandCtaUnderlay decor={decor} />
            </span>
            <span
              data-ui-button=""
              className="block h-5 w-[72px] rounded-full"
              style={{ backgroundColor: "var(--ui-primary-bg)" }}
            />
          </span>
        </div>
        {[0, 1].map((index) => (
          <div
            key={index}
            className="space-y-1.5 rounded-card border p-2.5"
            style={{
              backgroundColor:
                index === 0 ? "var(--ui-card-bg)" : "var(--color-accent-soft)",
              borderColor: "var(--color-line)",
            }}
          >
            <span className="block h-1.5 w-12 rounded-full bg-panel" />
            <span className="block h-2 w-16 rounded-full" style={{ backgroundColor: "var(--color-ink)", opacity: 0.75 }} />
            <span className="block h-1.5 w-10 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
          </div>
        ))}
      </div>
      {locked ? (
        <span className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="3" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}
