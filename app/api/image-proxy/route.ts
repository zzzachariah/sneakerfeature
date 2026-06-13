import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, { status: 200, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
