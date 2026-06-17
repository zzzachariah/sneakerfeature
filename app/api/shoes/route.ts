import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicShoes } from "@/lib/data/shoes";

// Public shoe catalog for the on-device (IndexedDB) library — see
// lib/local/use-local-shoes.ts. The data is already public via SSR, but a single
// endpoint returning the whole DB is easy to bulk-scrape, so this adds light
// best-effort protection:
//   • requires the app/site's own `x-sf-app` header — blocks naive `curl` and
//     cross-origin browser fetch (which can't set custom headers without CORS we
//     don't grant);
//   • a per-instance rate limit on top.
// It also supports conditional GET (ETag / If-None-Match) so re-syncs that find
// nothing changed cost almost nothing.
export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
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

export async function GET(request: NextRequest) {
  if (request.headers.get("x-sf-app") !== "1") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const shoes = await getPublicShoes();
  const version = createHash("sha1").update(JSON.stringify(shoes)).digest("hex").slice(0, 16);
  const etag = `"${version}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(
    { version, shoes },
    { headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" } }
  );
}
