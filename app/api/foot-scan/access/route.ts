import { NextResponse } from "next/server";
import { getFootScanContext } from "@/lib/foot-scan/access";
import { getFootProfile } from "@/lib/foot-scan/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lets the client (e.g. the persona modal) decide whether to surface a Foot Scan
// entry, and show the current saved profile so it can offer a re-scan. Returns
// canUse=false rather than 403 so callers can branch without treating it as an
// error — the tool stays hidden otherwise.
export async function GET() {
  const ctx = await getFootScanContext();
  if (!ctx) return NextResponse.json({ ok: true, canUse: false, profile: null });
  const profile = await getFootProfile(ctx.userId);
  return NextResponse.json({ ok: true, canUse: true, profile });
}
