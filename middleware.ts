import { NextResponse, type NextRequest } from "next/server";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/compare" ||
    pathname === "/quick-picker" ||
    pathname === "/smart-picker" ||
    pathname === "/favorites" ||
    pathname === "/search/advanced" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/disclaimer" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/shoes/")
  );
}

function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname === "/signup" || pathname === "/register";
}

function hasAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
}

// API paths that legitimately receive cross-origin POSTs (webhooks / cron
// hits from Vercel + Supabase). Each handler independently verifies its
// own signature / bearer secret, so they're exempt from the Origin check.
//
// Intentionally public POST endpoints and rationale:
//   /api/auth/send-email-hook  — Supabase webhook; verified by shared secret in handler.
//   /api/cron/weekly-digest    — Vercel cron; verified by CRON_SECRET bearer token in handler.
//                                NOTE: Add new cron routes here explicitly — do NOT widen to
//                                `/api/cron/` prefix, as that would silently exempt future
//                                handlers that may lack proper bearer-secret verification.
//   /api/translate             — Public translation proxy; intentionally unauthenticated.
//                                Risk accepted: no user data mutated; abuse should be
//                                mitigated by an IP-based rate limit in the route handler.
//   /api/announcements/*/view  — Public view-count increment; intentionally unauthenticated.
//                                Risk accepted: counter inflation only; no sensitive data exposed.
function isCrossOriginAllowedApi(pathname: string) {
  return (
    pathname.startsWith("/api/auth/send-email-hook") ||
    pathname === "/api/cron/weekly-digest" ||
    pathname === "/api/translate" ||
    /^\/api\/announcements\/[^/]+\/view$/.test(pathname)
  );
}

// Internally safe HTTP methods — these can never mutate state, so an Origin
// header (which browsers strip on simple cross-site reads anyway) isn't
// required.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Reject browser-initiated mutating requests that didn't originate from our
// own site. Server-to-server callers don't send Origin; we allow those
// through (auth + signature checks live in the route handlers).
function isCsrfBlocked(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false; // non-browser caller; route handler verifies auth
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const appHost = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : request.nextUrl.host;
  return originHost !== appHost;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    if (!isCrossOriginAllowedApi(pathname) && isCsrfBlocked(request)) {
      return NextResponse.json(
        { ok: false, message: "Cross-origin request rejected." },
        { status: 403 }
      );
    }
    return NextResponse.next({ request });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  const loggedIn = hasAuthCookie(request);

  if (!loggedIn && !isAuthPage(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (loggedIn && isAuthPage(pathname)) {
    const nextParam = request.nextUrl.searchParams.get("next");
    // Must start with a single "/" — reject protocol-relative ("//evil.com")
    // and absolute URLs, both of which browsers would otherwise resolve to a
    // different origin (open-redirect vector).
    const safe =
      nextParam !== null &&
      nextParam.startsWith("/") &&
      !nextParam.startsWith("//") &&
      !nextParam.startsWith("/\\");
    const destination = safe ? nextParam : "/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
