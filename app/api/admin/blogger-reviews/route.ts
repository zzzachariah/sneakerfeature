import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";

const PAGE_SIZE = 50;
const LITE_SEARCH_CAP = 5000;

const SELECT_LIST =
  "id, shoe_id, blogger_name, platform, video_url, pros, cons, summary, pros_en, cons_en, summary_en, status, error_detail, is_published, source_label, transcript, created_at, updated_at, shoes(shoe_name, brand, slug)";

type LiteShoe = { shoe_name: string | null; brand: string | null };
type LiteRow = { id: string; blogger_name: string | null; shoes: LiteShoe | LiteShoe[] | null };

function pageBounds(requestedPage: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const from = (page - 1) * PAGE_SIZE;
  return { page, from, to: from + PAGE_SIZE - 1 };
}

// Admin list — full rows (incl. transcript/status/error_detail) plus the parent
// shoe name. Paginated (50 / page) and searchable so every record is reachable,
// not just the most recent few hundred.
//   ?page=<1-based>   page to return (clamped to the valid range server-side)
//   ?q=<text>         case-insensitive search over shoe name, brand, AND blogger
//   ?shoeId=<uuid>    restrict to a single shoe
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const params = new URL(request.url).searchParams;
  const shoeId = (params.get("shoeId") ?? "").trim();
  const q = (params.get("q") ?? "").trim();
  const requestedPage = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  // --- No search: paginate directly in the database. ---
  if (!q) {
    let countQuery = supabase.from("blogger_reviews").select("id", { count: "exact", head: true });
    if (shoeId) countQuery = countQuery.eq("shoe_id", shoeId);
    const { count, error: countErr } = await countQuery;
    if (countErr) return NextResponse.json({ ok: false, message: countErr.message }, { status: 400 });

    const total = count ?? 0;
    if (total === 0) return NextResponse.json({ ok: true, reviews: [], total: 0, page: 1, pageSize: PAGE_SIZE });

    const { page, from, to } = pageBounds(requestedPage, total);
    let dataQuery = supabase
      .from("blogger_reviews")
      .select(SELECT_LIST)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (shoeId) dataQuery = dataQuery.eq("shoe_id", shoeId);
    const { data, error } = await dataQuery;
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, reviews: data ?? [], total, page, pageSize: PAGE_SIZE });
  }

  // --- Search over shoe name / brand / blogger. The review set is small (it is
  // populated by hand via the ingest scripts), so we match on a lightweight
  // projection in one pass, then fetch full rows only for the current page.
  // This searches both the review's own column (blogger_name) and the joined
  // shoe (shoe_name, brand) without fragile cross-table filters or oversized
  // shoe_id IN (...) lists. ---
  let liteQuery = supabase
    .from("blogger_reviews")
    .select("id, blogger_name, shoes(shoe_name, brand)")
    .order("created_at", { ascending: false })
    .limit(LITE_SEARCH_CAP);
  if (shoeId) liteQuery = liteQuery.eq("shoe_id", shoeId);
  const { data: lite, error: liteErr } = await liteQuery;
  if (liteErr) return NextResponse.json({ ok: false, message: liteErr.message }, { status: 400 });

  const needle = q.toLowerCase();
  const matchedIds = ((lite ?? []) as unknown as LiteRow[])
    .filter((r) => {
      const shoe = Array.isArray(r.shoes) ? r.shoes[0] : r.shoes;
      return (
        (shoe?.shoe_name ?? "").toLowerCase().includes(needle) ||
        (shoe?.brand ?? "").toLowerCase().includes(needle) ||
        (r.blogger_name ?? "").toLowerCase().includes(needle)
      );
    })
    .map((r) => r.id);

  const total = matchedIds.length;
  if (total === 0) return NextResponse.json({ ok: true, reviews: [], total: 0, page: 1, pageSize: PAGE_SIZE });

  const { page, from, to } = pageBounds(requestedPage, total);
  const pageIds = matchedIds.slice(from, to + 1);

  const { data: full, error } = await supabase.from("blogger_reviews").select(SELECT_LIST).in("id", pageIds);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  // Preserve the created_at-desc order of the matched slice (.in() is unordered).
  const byId = new Map((full ?? []).map((r) => [r.id, r] as const));
  const reviews = pageIds.map((id) => byId.get(id)).filter(Boolean);

  return NextResponse.json({ ok: true, reviews, total, page, pageSize: PAGE_SIZE });
}
