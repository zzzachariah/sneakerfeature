import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
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

async function loadAll(): Promise<Record<string, BloggerReview[]>> {
  const sb = createPublicClient();
  if (!sb) return {};

  const primary = await sb
    .from("blogger_reviews")
    .select(PUBLIC_COLUMNS)
    .eq("is_published", true)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (primary.error) console.error("[blogger-reviews] public fetch failed", primary.error);

  let rows = (primary.data ?? []) as ReviewRow[];

  // RLS can hide rows from the anon client; retry with the service-role client
  // before giving up (same rationale as the shoe_stories fallback in shoes.ts).
  if (!rows.length) {
    const admin = createAdminClient();
    if (admin) {
      const retry = await admin
        .from("blogger_reviews")
        .select(PUBLIC_COLUMNS)
        .eq("is_published", true)
        .eq("status", "ready")
        .order("created_at", { ascending: true });
      if (retry.error) console.error("[blogger-reviews] service-role retry failed", retry.error);
      else rows = (retry.data ?? []) as ReviewRow[];
    }
  }

  const byShoe: Record<string, BloggerReview[]> = {};
  const counts: Record<string, { youtube: number; bilibili: number }> = {};
  for (const row of rows) {
    const r = normalize(row);
    const arr = (byShoe[r.shoe_id] ??= []);
    const c = (counts[r.shoe_id] ??= { youtube: 0, bilibili: 0 });
    if (c[r.platform] < MAX_PER_PLATFORM) {
      arr.push(r);
      c[r.platform] += 1;
    }
  }
  return byShoe;
}

// Returns a plain Record (not a Map) so unstable_cache can serialize it.
const getAllBloggerReviews = unstable_cache(loadAll, ["blogger-reviews-v1"], {
  tags: ["blogger_reviews", "shoes"],
  revalidate: 300
});

export async function getBloggerReviewsForShoe(shoeId: string): Promise<BloggerReview[]> {
  const all = await getAllBloggerReviews();
  return all[shoeId] ?? [];
}
