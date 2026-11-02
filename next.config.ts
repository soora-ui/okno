import os from "node:os";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "images.unsplash.com",
  },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl) {
  const parsedSupabaseUrl = new URL(supabaseUrl);
  remotePatterns.push({
    protocol: parsedSupabaseUrl.protocol.replace(":", "") as "http" | "https",
    hostname: parsedSupabaseUrl.hostname,
    // Свой Supabase живёт под префиксом (okno.business/supabase), облачный — в корне.
    pathname: `${parsedSupabaseUrl.pathname.replace(/\/$/, "")}/storage/v1/object/public/profile-media/**`,
  });
}

const isProduction = process.env.NODE_ENV === "production";

// Источники, которые страница реально грузит из браузера. Supabase на проде живёт
// под okno.business/supabase (это 'self'), локально и в облаке — на своём origin.
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
const connectSources = [
  "'self'",
  "https://nominatim.openstreetmap.org",
  "https://*.sentry.io",
  ...(supabaseOrigin ? [supabaseOrigin, supabaseOrigin.replace(/^http/, "ws")] : []),
];

// Инлайновые скрипты Next кладёт без nonce, а nonce через proxy.ts сделал бы все
// страницы динамическими — поэтому script-src с 'unsafe-inline'. Внешние скрипты
// при этом закрыты: кроме своих, только SDK мини-аппа Telegram. Нарушения летят
// в /api/observability/csp-report → лента /admin/errors.
// 'unsafe-eval' на проде не нужен: zod лишь проверяет его в try/catch.
// Картинки — любые https: аватары и логотипы бывают внешними, вреда от этого нет.
function buildCsp(frameAncestors: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://telegram.org`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${supabaseOrigin?.startsWith("http:") ? ` ${supabaseOrigin}` : ""}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "object-src 'none'",
    "base-uri 'self'",
    "report-uri /api/observability/csp-report",
  ].join("; ");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Камера нужна сканеру сертификатов, остальное сайту не нужно.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // allow-popups: оплата и вход через сторонние окна должны видеть opener.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // Устаревший фильтр браузеров сам бывал источником утечек; при CSP — выключен.
  { key: "X-XSS-Protection", value: "0" },
  // Веб-сайтов на поддоменах нет (mail — только почта, link.mail для Unisender не
  // заведён). Заведёте трекинг ссылок — только с HTTPS. Браузеры игнорируют HSTS
  // на http://localhost.
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

function getAllowedDevOrigins() {
  const hosts = new Set(["localhost", "127.0.0.1"]);

  for (const networkInterface of Object.values(os.networkInterfaces()).flat()) {
    if (!networkInterface || networkInterface.internal) {
      continue;
    }

    if (networkInterface.family === "IPv4") {
      hosts.add(networkInterface.address);
    }
  }

  return Array.from(hosts);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Сервис-воркер браузер должен перепроверять при каждом заходе, иначе
      // исправление в нём доедет до установленных приложений только через сутки.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Мини-апп Telegram в веб-версии открывается в iframe на web.telegram.org,
      // всё остальное встраивать можно только в наши же страницы (тур, превью).
      {
        source: "/((?!tg(?:/|$)).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: buildCsp("'self'") },
        ],
      },
      {
        source: "/tg/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildCsp("'self' https://web.telegram.org"),
          },
        ],
      },
    ];
  },
  // @resvg/resvg-js грузит нативный .node-биндинг через рантайм-require по
  // платформе — Turbopack не умеет разместить это как ES-модуль-чанк
  // (см. рендер сертификатов, src/lib/certificates/render.ts).
  // undici — свой fetch с ProxyAgent для запросов в РФ (src/lib/net/ru-egress.ts);
  // берём его из node_modules как есть, а не из бандла.
  serverExternalPackages: ["@resvg/resvg-js", "undici"],
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  images: {
    remotePatterns,
    // На проде okno.business резолвится в 127.0.0.1 (/etc/hosts): свой Supabase на
    // том же сервере. Next 16 по умолчанию не оптимизирует картинки с локальных IP;
    // источники всё равно ограничены remotePatterns — только публичные файлы.
    dangerouslyAllowLocalIP: true,
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: Boolean(process.env.SENTRY_AUTH_TOKEN),
});
