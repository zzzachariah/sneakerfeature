import { NextResponse } from "next/server";
import { getCurrentAnnouncement } from "@/lib/admin/announcements";

// Public read used by the popup (components/announce/announcement-modal.tsx)
// and by the iOS/Android Capacitor shells that load the live site. Served
// without caching so a freshly-published or just-taken-down announcement
// reaches every visitor on their next poll.
export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getCurrentAnnouncement();
  return NextResponse.json(current, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
