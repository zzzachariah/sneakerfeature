import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicShoes } from "@/lib/data/shoes";
import { createClient } from "@/lib/supabase/server";

// Shoe catalog endpoint for authenticated app clients — see
// lib/local/use-local-shoes.ts. Requires a valid Supabase session; unauthenticated
// requests are rejected with 403. Also enforces a per-IP rate limit.
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
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "server_error" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
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
    { headers: { ETag: etag, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
