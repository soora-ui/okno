import Link from "next/link";

// Логотип из брендбука (брендбук/logo/okno-logo.svg): кольцо-«о» и «kno».
// viewBox обрезан по краям знака, цвет берётся из currentColor, чтобы лого
// подстраивалось под тему страницы.
export const brandLogoViewBox = { x: 38, y: 38, width: 312, height: 128 };
export const brandLogoRing = { cx: 102, cy: 102, r: 50, strokeWidth: 24 };
export const brandLogoWordmarkPath =
  "M6.9 0 7 -72H19.2V-28L38.95 -54H54L33.05 -27L55.8 0H39.85L19.2 -26V0Z M97.15 0V-26Q97.15 -28.55 96.8 -31.65Q96.45 -34.75 95.18 -37.62Q93.9 -40.5 91.38 -42.35Q88.85 -44.2 84.55 -44.2Q82.25 -44.2 80 -43.45Q77.75 -42.7 75.93 -40.88Q74.1 -39.05 73 -35.88Q71.9 -32.7 71.9 -27.75L64.75 -30.8Q64.75 -37.7 67.43 -43.3Q70.1 -48.9 75.3 -52.23Q80.5 -55.55 88.1 -55.55Q94.1 -55.55 98 -53.55Q101.9 -51.55 104.2 -48.45Q106.5 -45.35 107.6 -41.85Q108.7 -38.35 109.03 -35.23Q109.35 -32.1 109.35 -30.15V0ZM59.7 0V-54H70.45V-37.25H71.9V0Z M145.2 1.5Q137.1 1.5 131.05 -2.15Q125 -5.8 121.68 -12.23Q118.35 -18.65 118.35 -27Q118.35 -35.5 121.75 -41.9Q125.15 -48.3 131.2 -51.9Q137.25 -55.5 145.2 -55.5Q153.35 -55.5 159.4 -51.85Q165.45 -48.2 168.8 -41.78Q172.15 -35.35 172.15 -27Q172.15 -18.6 168.78 -12.18Q165.4 -5.75 159.35 -2.12Q153.3 1.5 145.2 1.5ZM145.2 -9.8Q152.4 -9.8 155.9 -14.6Q159.4 -19.4 159.4 -27Q159.4 -34.85 155.85 -39.53Q152.3 -44.2 145.2 -44.2Q140.35 -44.2 137.23 -42.03Q134.1 -39.85 132.6 -35.98Q131.1 -32.1 131.1 -27Q131.1 -19.15 134.68 -14.48Q138.25 -9.8 145.2 -9.8Z";
export const brandLogoWordmarkTransform = "translate(174,164)";

export function BrandLogoMark({ className }: { className?: string }) {
  const { x, y, width, height } = brandLogoViewBox;
  return (
    <svg
      viewBox={`${x} ${y} ${width} ${height}`}
      className={className}
      role="img"
      aria-label="okno"
    >
      <circle
        cx={brandLogoRing.cx}
        cy={brandLogoRing.cy}
        r={brandLogoRing.r}
        fill="none"
        stroke="currentColor"
        strokeWidth={brandLogoRing.strokeWidth}
      />
      <path
        d={brandLogoWordmarkPath}
        fill="currentColor"
        transform={brandLogoWordmarkTransform}
      />
    </svg>
  );
}

export function BrandLogo({
  href = "/",
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 text-ink"
    >
      <BrandLogoMark className="h-8 w-auto" />
      {children}
    </Link>
  );
}
