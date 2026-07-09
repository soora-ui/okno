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
    pathname: "/storage/v1/object/public/profile-media/**",
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
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  images: {
    remotePatterns,
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: Boolean(process.env.SENTRY_AUTH_TOKEN),
});
