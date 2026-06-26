import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAnnouncementView } from "@/lib/announcements/views";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // 36-char uuid (with hyphens) or empty when the visitor is logged in.
  clientId: z.string().min(1).max(64).optional(),
});

// ---------------------------------------------------------------------------
// Lightweight in-memory rate limiter
// Keyed on "<ip>:<announcementId>" for anonymous callers (max 5/hour) and
// "<ip>:*" for authenticated callers (max 20/hour across all announcements).
// ---------------------------------------------------------------------------
const ANON_LIMIT = 5;
const AUTH_LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1_000; // 1 hour

interface RateBucket {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Visitors' announcement-popup component POSTs to this endpoint once when a
 * given announcement first appears for them. We dedupe by (user_id) for
 * logged-in viewers and by (client_id) for anonymous ones.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  // Verify the announcement exists before recording a view, preventing orphaned rows.
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 500 });
  const { data: announcement, error: lookupError } = await admin
    .from("announcements")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError || !announcement) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let parsed: { clientId?: string } = {};
  try {
    parsed = bodySchema.parse(await request.json().catch(() => ({})));
  } catch {
    // Treat malformed bodies as anonymous-no-client-id; recordAnnouncementView
    // bails when there's no identifier, so we just no-op.
  }

  let userId: string | null = null;
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  // Rate limiting: anonymous callers are capped at 5 POSTs per IP per
  // announcement per hour; authenticated callers at 20 POSTs per IP per hour
  // across all announcements (upsert deduplication handles correctness).
  const ip = getClientIp(request);
  if (userId) {
    if (!checkRateLimit(`${ip}:*`, AUTH_LIMIT)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
  } else {
    if (!checkRateLimit(`${ip}:${id}`, ANON_LIMIT)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
  }

  await recordAnnouncementView({
    announcementId: id,
    userId,
    clientId: parsed.clientId ?? null,
  });
  return NextResponse.json({ ok: true });
}
