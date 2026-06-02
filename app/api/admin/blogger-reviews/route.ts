import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";

// Admin list — returns the FULL row (incl. transcript/status/error_detail) plus
// the parent shoe's name, optionally filtered to one shoe via ?shoeId=.
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const shoeId = (new URL(request.url).searchParams.get("shoeId") ?? "").trim();

  let query = supabase
    .from("blogger_reviews")
    .select(
      "id, shoe_id, blogger_name, platform, video_url, pros, cons, summary, pros_en, cons_en, summary_en, status, error_detail, is_published, source_label, transcript, created_at, updated_at, shoes(shoe_name, brand, slug)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (shoeId) query = query.eq("shoe_id", shoeId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, reviews: data ?? [] });
}
