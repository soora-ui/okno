import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import {
  brandLogoRing,
  brandLogoViewBox,
  brandLogoWordmarkPath,
  brandLogoWordmarkTransform,
} from "@/components/layout/brand-logo";
import { pricingPlans, trialDays } from "@/config/plans";
import { defaultOgImage } from "@/config/site";

// Превью ссылки в Telegram, VK и WhatsApp. Рендерится один раз при сборке и
// наследуется всеми страницами, у которых нет своей картинки. Шрифт свой:
// встроенный в next/og не умеет кириллицу.
export const alt = defaultOgImage.alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const minPlanPriceRub = Math.min(...pricingPlans.map((plan) => plan.priceRub));

export default async function OpengraphImage() {
  const [bold, medium] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Manrope-Bold.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Manrope-Medium.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "#faf7f1",
          color: "#23241f",
          fontFamily: "Manrope",
        }}
      >
        <svg
          width={(brandLogoViewBox.width * 72) / brandLogoViewBox.height}
          height={72}
          viewBox={`${brandLogoViewBox.x} ${brandLogoViewBox.y} ${brandLogoViewBox.width} ${brandLogoViewBox.height}`}
        >
          <circle
            cx={brandLogoRing.cx}
            cy={brandLogoRing.cy}
            r={brandLogoRing.r}
            fill="none"
            stroke="#23241f"
            strokeWidth={brandLogoRing.strokeWidth}
          />
          <path
            d={brandLogoWordmarkPath}
            fill="#23241f"
            transform={brandLogoWordmarkTransform}
          />
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 66,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            Онлайн-запись для мастеров и салонов красоты
          </div>
          <div style={{ fontSize: 32, fontWeight: 500, color: "#434239" }}>
            Клиенты записываются сами по ссылке, а вы видите весь день
          </div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {[`${trialDays} дней бесплатно`, `от ${minPlanPriceRub} ₽ в месяц`, "okno.business"].map(
            (label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "14px 28px",
                  borderRadius: 999,
                  background: label === "okno.business" ? "#b8d3c4" : "#eee7dc",
                  fontSize: 28,
                  fontWeight: 500,
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Manrope", data: bold, weight: 700, style: "normal" },
        { name: "Manrope", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
