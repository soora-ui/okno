import { NextResponse, type NextRequest } from "next/server";
import { appMode, isSupabaseConfigured } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";
import {
  DEMO_CABINET_HEADER,
  DEMO_CABINET_PREFIX,
  demoCabinetToken,
} from "@/lib/demo-cabinet";

const protectedMatchers = [
  "/dashboard",
  "/schedule",
  "/clients",
  "/settings",
  "/team",
  "/archive",
  "/knowledge",
  "/admin",
];

// Any real route segment (static pages and usernames alike) is lowercase
// alnum/hyphen. Bots probing for exploit paths (wp-config.php.save, .env,
// xmlrpc.php...) land on the single-segment [username] route, hit Supabase,
// and occasionally surface as real errors under load. Reject the malformed
// ones here, before they reach rendering or the database.
const SINGLE_SEGMENT_PATH = /^\/[^/]+$/;
const VALID_SEGMENT_PATH = /^\/[a-z0-9-]+$/;
// Служебные файлы для поисковиков и AI-краулеров (src/app/robots.ts,
// sitemap.ts, llms.txt) — с точкой в имени, но настоящие маршруты.
const CRAWLER_FILES = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt"]);

function buildLoginRedirect(
  request: NextRequest,
  reason: "auth" | "setup" | "disabled",
  sourceResponse?: NextResponse,
) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("reason", reason);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(loginUrl);

  if (sourceResponse) {
    sourceResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value, cookie);
    });
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (CRAWLER_FILES.has(pathname)) {
    return NextResponse.next();
  }

  if (SINGLE_SEGMENT_PATH.test(pathname) && !VALID_SEGMENT_PATH.test(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  const isProtectedRoute = protectedMatchers.some((path) => pathname.startsWith(path));

  // Next strips its internal RSC/prefetch headers before Proxy runs, but the
  // browser's Sec-Fetch-Dest survives: "document" is a real top-level
  // navigation, "empty" is a fetch() — i.e. an RSC soft-navigation or prefetch.
  // WebKit/Safari aborts a fetch() that carries custom headers when it hits an
  // HTTP redirect ("access control checks" CORS error), which breaks client
  // navigation. So for RSC fetches we answer 204 instead of redirecting; the
  // App Router then falls back to a full document navigation that receives the
  // real 307 — no Safari error, auth still enforced.
  const isRscFetch = request.headers.get("sec-fetch-dest") === "empty";
  const denyAccess = (reason: "auth" | "setup", sourceResponse?: NextResponse) =>
    isRscFetch
      ? new NextResponse(null, { status: 204 })
      : buildLoginRedirect(request, reason, sourceResponse);

  // Демо-кабинет для тура: мок-данные без входа, только на чтение.
  // См. src/lib/demo-cabinet.ts.
  if (pathname.startsWith(`${DEMO_CABINET_PREFIX}/`)) {
    // Серверные действия форм уходят POST-ом на адрес страницы. С демо-
    // страниц их пропускать нельзя: у залогиненного мастера они записали бы
    // демо-значения в его настоящие настройки.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse(null, { status: 405 });
    }
    const headers = new Headers(request.headers);
    headers.set(DEMO_CABINET_HEADER, demoCabinetToken());
    return NextResponse.next({ request: { headers } });
  }

  if (appMode === "demo") {
    return NextResponse.next();
  }

  if (!isProtectedRoute && !isSupabaseConfigured) {
    return NextResponse.next();
  }

  if (!isSupabaseConfigured) {
    return denyAccess("setup");
  }

  const { response, user } = await updateSession(request);

  if (isProtectedRoute && !user) {
    return denyAccess("auth", response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
