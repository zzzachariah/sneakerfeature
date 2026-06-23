import { NextResponse } from "next/server";
import { getAnnouncementHistory } from "@/lib/admin/announcements";

export const dynamic = "force-dynamic";

export async function GET() {
  const history = await getAnnouncementHistory();
  return NextResponse.json(history, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
