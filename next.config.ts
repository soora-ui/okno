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
