import { NextResponse } from "next/server";
import { getFootScanContext } from "@/lib/foot-scan/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight check so the client (e.g. the persona modal) can decide whether to
// surface a Foot Scan entry. Returns canUse=false rather than 403 so callers can
// branch without treating it as an error — the tool stays hidden otherwise.
export async function GET() {
  const ctx = await getFootScanContext();
  return NextResponse.json({ ok: true, canUse: ctx !== null });
}
