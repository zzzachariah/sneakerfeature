import { NextResponse } from "next/server";
import { getActiveAnnouncements } from "@/lib/announcements/store";

// Public endpoint consumed by the site-wide announcement popup. Returns every
// enabled, non-expired row (newest first) so the popup can render a swipeable
// card-stack when multiple announcements run in parallel and collapse to a
// single dialog when only one is live. Returns [] when nothing is active.
// Falls back to public/announcement.json (GitHub-Action-published) when the
// DB has none — handled inside getActiveAnnouncements.

export async function GET() {
  const active = await getActiveAnnouncements();
  return NextResponse.json(active, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
