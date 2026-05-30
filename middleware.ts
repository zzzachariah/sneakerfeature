import { NextResponse, type NextRequest } from "next/server";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/compare" ||
    pathname === "/search/advanced" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/disclaimer" ||
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

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/") || isPublicPath(pathname)) {
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
    const destination = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
