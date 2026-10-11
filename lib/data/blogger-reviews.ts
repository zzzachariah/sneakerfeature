import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { readAllRows } from "@/lib/data/paginate";
import type { BloggerReview } from "@/lib/types";

// Public projection — never selects transcript/status/error_detail.
const PUBLIC_COLUMNS =
  "id, shoe_id, blogger_name, platform, video_url, pros, cons, summary, pros_en, cons_en, summary_en, source_label, created_at";

// At most 3 published reviews per platform per shoe, oldest first (stable order)
// — the detail UI toggles between YouTube and Bilibili, up to 3 cards each.
const MAX_PER_PLATFORM = 3;

type ReviewRow = {
  id: string;
  shoe_id: string;
  blogger_name: string;
  platform: string;
  video_url: string;
  pros: string[] | null;
  cons: string[] | null;
  summary: string | null;
  pros_en: string[] | null;
  cons_en: string[] | null;
  summary_en: string | null;
  source_label: string | null;
  created_at: string;
};

function normalize(row: ReviewRow): BloggerReview {
  const pros = Array.isArray(row.pros) ? row.pros : [];
  const cons = Array.isArray(row.cons) ? row.cons : [];
  return {
    id: row.id,
    shoe_id: row.shoe_id,
    blogger_name: row.blogger_name,
    platform: row.platform === "bilibili" ? "bilibili" : "youtube",
    video_url: row.video_url,
    pros,
    cons,
    summary: row.summary,
    // Fall back to the Chinese values if an EN column is somehow empty.
    pros_en: Array.isArray(row.pros_en) && row.pros_en.length ? row.pros_en : pros,
    cons_en: Array.isArray(row.cons_en) && row.cons_en.length ? row.cons_en : cons,
    summary_en: row.summary_en || row.summary,
    source_label: row.source_label,
    created_at: row.created_at
  };
}

async function loadAll(shoeId?: string): Promise<Record<string, BloggerReview[]>> {
  const sb = createPublicClient();
  if (!sb) return {};

  const rows = await readAllRows<ReviewRow>((from,to) => {
    let query = sb.from("blogger_reviews").select(PUBLIC_COLUMNS)
      .eq("is_published",true).eq("status","ready")
      .order("created_at",{ascending:true}).order("id");
    if (shoeId) query = query.eq("shoe_id",shoeId);
    return query.range(from,to);
  });

  const byShoe: Record<string, BloggerReview[]> = {};
  const counts: Record<string, { youtube: number; bilibili: number }> = {};
  const seenBloggers: Record<string, Set<string>> = {};
  for (const row of rows) {
    const r = normalize(row);
    const arr = (byShoe[r.shoe_id] ??= []);
    const c = (counts[r.shoe_id] ??= { youtube: 0, bilibili: 0 });
    const seen = (seenBloggers[r.shoe_id] ??= new Set());
    // One card per blogger per platform (drops duplicate uploaders, e.g. a
    // channel that posted multiple videos for the same shoe).
    const key = `${r.platform}::${r.blogger_name.trim().toLowerCase()}`;
    if (c[r.platform] < MAX_PER_PLATFORM && !seen.has(key)) {
      arr.push(r);
      c[r.platform] += 1;
      seen.add(key);
    }
  }
  return byShoe;
}

// Returns a plain Record (not a Map) so unstable_cache can serialize it.
export const getAllBloggerReviews = unstable_cache(loadAll, ["blogger-reviews-v2"], {
  tags: ["blogger_reviews", "shoes"],
  revalidate: 300
});

export const getBloggerReviewsForShoe = unstable_cache(async (shoeId: string): Promise<BloggerReview[]> => {
  const reviews = await loadAll(shoeId);
  return reviews[shoeId] ?? [];
}, ["blogger-review-detail-v1"], {tags:["blogger_reviews","shoes"],revalidate:300});
