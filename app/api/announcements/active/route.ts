import { NextResponse } from "next/server";
import { getActiveAnnouncement } from "@/lib/announcements/store";

// Public endpoint consumed by the site-wide announcement popup. Returns the
// newest enabled, non-expired row, or null when nothing is active. Falls back
// to public/announcement.json (GitHub-Action-published) when the DB has none.
export const dynamic = "force-dynamic";

export async function GET() {
  const active = await getActiveAnnouncement();
  return NextResponse.json(active, {
    headers: { "Cache-Control": "no-store" },
  });
}
