import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { listAnnouncements } from "@/lib/announcements/store";
import { countViewsForMany } from "@/lib/announcements/views";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const items = await listAnnouncements();
  const reads = await countViewsForMany(items.map((i) => i.id));
  return NextResponse.json({ ok: true, reads });
}
