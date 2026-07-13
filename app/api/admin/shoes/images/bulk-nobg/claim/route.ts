import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { claimNextNobgItem, computeNobgStats } from "@/lib/admin/bulk-nobg-jobs";

// The browser worker calls this to fetch the next shoe to cut out. Unlike the
// bulk image-import "tick" (where the server does the work), here the server
// only hands out the next claimed item + its live approved image; the actual
// background removal happens in the admin's browser, which then POSTs the
// result to ./commit.
export async function POST() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;

  try {
    const claim = await claimNextNobgItem({ supabase });
    const stats = await computeNobgStats(supabase);
    return NextResponse.json({ ok: true, done: claim.done, item: claim.item, job: claim.job, stats });
  } catch (error) {
    console.error("[admin] bulk-nobg claim step=process fail:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to claim next background-removal item.", detail: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 }
    );
  }
}
