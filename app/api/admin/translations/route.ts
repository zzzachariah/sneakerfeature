import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { loadTranslationState } from "@/lib/admin/translation-jobs";

// Status for the admin "translate everything" panel: how many shoes still have
// untranslated (English-only) content vs the total catalog size.
export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  try {
    const state = await loadTranslationState(auth.supabase, { force: false });
    return NextResponse.json({
      ok: true,
      stats: { totalShoes: state.totalShoes, pendingShoes: state.pendingCount }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load translation status.",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 500 }
    );
  }
}
