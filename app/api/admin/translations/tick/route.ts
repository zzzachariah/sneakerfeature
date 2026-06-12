import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPackyClient,
  describePackyEnvProblem,
  describePackyError,
  getPackyEnvReport
} from "@/lib/ai/packy-client";
import { loadTranslationState, translateAndStore } from "@/lib/admin/translation-jobs";

// Processes ONE shoe per call (one packyapi request that translates all of that
// shoe's pending fields). The client polls this in a loop, passing back the ids
// it has already processed in `excludeIds` so the run terminates. `force` re-
// translates shoes that already have Chinese.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, error: "Supabase service role key is not configured." },
      { status: 500 }
    );
  }

  const packy = createPackyClient();
  if (!packy) {
    return NextResponse.json({ ok: false, error: describePackyEnvProblem(getPackyEnvReport()) }, { status: 500 });
  }

  let body: { excludeIds?: unknown; force?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const force = body.force === true;

  try {
    const state = await loadTranslationState(auth.supabase, { force, excludeIds });
    const baseStats = { totalShoes: state.totalShoes, pendingShoes: state.pendingCount };

    if (!state.next) {
      return NextResponse.json({ ok: true, done: true, remaining: 0, processedShoeId: null, stats: baseStats });
    }

    const work = state.next;
    let success = true;
    let detail: string | null = null;
    try {
      const written = await translateAndStore(adminClient, packy, work);
      if (written === 0) {
        success = false;
        detail = "no_translation_produced";
      }
    } catch (e) {
      success = false;
      detail = describePackyError(e);
    }

    if (success) revalidateTag("shoes");

    const remaining = Math.max(0, state.pendingCount - 1);
    return NextResponse.json({
      ok: true,
      done: remaining === 0,
      processedShoeId: work.shoeId,
      label: work.label,
      success,
      detail,
      remaining,
      stats: baseStats
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to process translation tick.",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 500 }
    );
  }
}
