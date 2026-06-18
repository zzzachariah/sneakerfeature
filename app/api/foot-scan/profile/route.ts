import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getFootScanContext } from "@/lib/foot-scan/access";
import { buildFootProfile, getFootProfile, getScan, listScans, saveFootProfile } from "@/lib/foot-scan/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Return the current kept profile + recent scan history.
export async function GET() {
  const ctx = await getFootScanContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const [profile, history] = await Promise.all([getFootProfile(ctx.userId), listScans(ctx.userId, 10)]);
  return NextResponse.json({ ok: true, profile, history });
}

const schema = z.object({ scanId: z.string().uuid() });

// Keep a given scan as the user's foot profile (used by the AI Smart Picker).
export async function POST(request: Request) {
  const ctx = await getFootScanContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "A valid scanId is required." }, { status: 400 });
  }

  const scan = await getScan(ctx.userId, parsed.data.scanId);
  if (!scan) return NextResponse.json({ ok: false, message: "Scan not found." }, { status: 404 });

  const profile = buildFootProfile(scan.result, scan.created_at);
  const ok = await saveFootProfile(ctx.userId, profile);
  if (!ok) return NextResponse.json({ ok: false, message: "Could not save profile." }, { status: 500 });

  // The feed/recommendations read the profile; refresh server views.
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, profile });
}
