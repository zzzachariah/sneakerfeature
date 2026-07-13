import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { computeNobgStats, requestNobgJobCancel } from "@/lib/admin/bulk-nobg-jobs";

export async function POST() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase, user } = auth;

  try {
    const cancelled = await requestNobgJobCancel({ supabase, userId: user.id });
    const stats = await computeNobgStats(supabase);

    return NextResponse.json({
      ok: cancelled.ok,
      message: cancelled.message,
      job: "job" in cancelled ? cancelled.job : null,
      stats
    });
  } catch (error) {
    console.error("[admin] bulk-nobg abort step=cancel fail:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to request bulk job stop.", detail: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 }
    );
  }
}
