import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";

const PAGE_SIZE = 50;

const SELECT_LIST =
  "id, shoe_id, blogger_name, platform, video_url, pros, cons, summary, pros_en, cons_en, summary_en, status, error_detail, is_published, source_label, transcript, created_at, updated_at, shoes(shoe_name, brand, slug)";

// Admin list — returns the FULL row (incl. transcript/status/error_detail) plus
// the parent shoe's name. Paginated (50 / page) and searchable by shoe name so
// every record is reachable, not just the most recent few hundred.
//   ?page=<1-based>   page to return (clamped to the valid range server-side)
//   ?q=<text>         case-insensitive shoe-name search across ALL records
//   ?shoeId=<uuid>    restrict to a single shoe
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const params = new URL(request.url).searchParams;
  const shoeId = (params.get("shoeId") ?? "").trim();
  const q = (params.get("q") ?? "").trim();
  const requestedPage = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  // Resolve a shoe-name search to the set of matching shoe ids. Filtering
  // blogger_reviews by shoe_id (a top-level column) keeps the count + range
  // queries simple and reliable, unlike filtering through an embedded join.
  let shoeIds: string[] | null = null;
  if (q) {
    const { data: shoeRows, error: shoeErr } = await supabase
      .from("shoes")
      .select("id")
      .ilike("shoe_name", `%${q}%`)
      .limit(2000);
    if (shoeErr) return NextResponse.json({ ok: false, message: shoeErr.message }, { status: 400 });
    shoeIds = (shoeRows ?? []).map((s) => s.id as string);
    if (shoeIds.length === 0) {
      return NextResponse.json({ ok: true, reviews: [], total: 0, page: 1, pageSize: PAGE_SIZE });
    }
  }

  // Total first, so we can clamp the page and never request an out-of-range slice.
  let countQuery = supabase.from("blogger_reviews").select("id", { count: "exact", head: true });
  if (shoeId) countQuery = countQuery.eq("shoe_id", shoeId);
  if (shoeIds) countQuery = countQuery.in("shoe_id", shoeIds);
  const { count, error: countErr } = await countQuery;
  if (countErr) return NextResponse.json({ ok: false, message: countErr.message }, { status: 400 });

  const total = count ?? 0;
  if (total === 0) {
    return NextResponse.json({ ok: true, reviews: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let dataQuery = supabase
    .from("blogger_reviews")
    .select(SELECT_LIST)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (shoeId) dataQuery = dataQuery.eq("shoe_id", shoeId);
  if (shoeIds) dataQuery = dataQuery.in("shoe_id", shoeIds);
  const { data, error } = await dataQuery;
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, reviews: data ?? [], total, page, pageSize: PAGE_SIZE });
}
