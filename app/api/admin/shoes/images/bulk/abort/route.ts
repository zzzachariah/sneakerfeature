import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { computeBulkImageStats, requestBulkJobCancel } from "@/lib/admin/bulk-image-jobs";

export async function POST() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase, user } = auth;

  try {
    const cancelled = await requestBulkJobCancel({ supabase, userId: user.id });
    const stats = await computeBulkImageStats(supabase);

    return NextResponse.json({
      ok: cancelled.ok,
      message: cancelled.message,
      job: "job" in cancelled ? cancelled.job : null,
      stats
    });
  } catch (error) {
    console.error("[admin] bulk-image abort step=cancel fail:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to request bulk job stop.", detail: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 }
    );
  }
}
