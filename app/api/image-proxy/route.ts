import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

function allowlistedHosts(): Set<string> {
  const hosts = new Set<string>();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      hosts.add(new URL(supabaseUrl).host);
    } catch {
      // ignore malformed env
    }
  }
  hosts.add("snkrfeature.com");
  hosts.add("www.snkrfeature.com");
  return hosts;
}

export async function GET(request: NextRequest) {
  if (request.headers.get("x-sf-app") !== "1") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "server_error" }, { status: 500 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "unsupported protocol" }, { status: 400 });
  }

  const allowed = allowlistedHosts();
  const isAllowed = Array.from(allowed).some(
    (host) => parsed.host === host || parsed.host.endsWith(`.${host}`)
  );
  if (!isAllowed) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseHost = supabaseUrl
    ? (() => {
        try {
          return new URL(supabaseUrl).host;
        } catch {
          return null;
        }
      })()
    : null;
  if (
    supabaseHost &&
    parsed.host === supabaseHost &&
    !parsed.pathname.startsWith("/storage/v1/object/public/")
  ) {
    return NextResponse.json({ error: "path not allowed" }, { status: 403 });
  }

  const upstream = await fetch(parsed.toString(), {
    headers: { Accept: "image/*" },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "upstream fetch failed", status: upstream.status },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const headers = new Headers({
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_SITE_URL ?? "https://snkrfeature.com",
    "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  const lastModified = upstream.headers.get("last-modified");
  if (lastModified) headers.set("Last-Modified", lastModified);

  return new NextResponse(upstream.body, { status: 200, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_SITE_URL ?? "https://snkrfeature.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Cache-Control",
      "Access-Control-Max-Age": "86400",
    },
  });
}
