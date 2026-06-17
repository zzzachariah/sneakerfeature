import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoShoes } from "@/lib/data/demo-shoes";
import { getCurrentProfile } from "@/lib/data/auth";
import { Shoe, ShoeImageRecord, ShoeSpec } from "@/lib/types";
import {
  combineDimScores,
  DIM_KEYS,
  dimScores,
  isValidFocus,
  percentileToStars,
  rankScoresToPercentiles,
  weightedCombinedScore,
  type DimKey,
  type RatingFocus
} from "@/lib/star-rating";

type ShoeRow = Omit<Shoe, "spec" | "story"> & { shoe_specs: ShoeSpec[] | null; shoe_images?: ShoeImageRecord[] | null };
type ShoeStory = NonNullable<Shoe["story"]>;
type ShoeStoryRow = {
  shoe_id: string;
  title?: string | null;
  content?: string | null;
  title_zh?: string | null;
  content_zh?: string | null;
  source_label?: string | null;
  source_url?: string | null;
  created_at?: string | null;
};
type ShoeQueryRow = ShoeRow & { story: ShoeStory | null };
export type ShoeImageState = {
  approved: ShoeImageRecord | null;
  pending: ShoeImageRecord | null;
  latestRejected: ShoeImageRecord | null;
};

type DimRow = {
  shoe_id: string;
  cushioning_feel: number | string | null;
  court_feel: number | string | null;
  bounce: number | string | null;
  stability: number | string | null;
  traction: number | string | null;
  fit: number | string | null;
};

type DimAggregate = {
  count: number;
  sums: Record<DimKey, number>;
};

type AggregateEntry = [string, DimAggregate];

type ShoesBase = {
  rows: ShoeQueryRow[];
  aggregates: AggregateEntry[];
};

function emptyDimRecord(): Record<DimKey, number> {
  return {
    cushioning_feel: 0,
    court_feel: 0,
    bounce: 0,
    stability: 0,
    traction: 0,
    fit: 0
  };
}

function resolveApprovedImage(images?: ShoeImageRecord[] | null) {
  if (!images?.length) return null;
  return [...images]
    .filter((image) => image.status === "approved")
    .sort((a, b) => new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime())[0] ?? null;
}

function normalizeStory(row: ShoeStoryRow): ShoeStory {
  return {
    title: row.title ?? null,
    content: row.content ?? null,
    title_zh: row.title_zh ?? null,
    content_zh: row.content_zh ?? null,
    source_label: row.source_label ?? null,
    source_url: row.source_url ?? null
  };
}

// Use select("*") instead of naming columns: a deployed shoe_stories table
// that is missing the optional source_label/source_url columns would make a
// column-named select fail the whole query (so title/content never load and
// the detail page falls back to "No editorial story yet"). Ordering is done
// in JS so the query has no dependency on a created_at column either.
async function fetchStoryRows(client: SupabaseClient) {
  return client.from("shoe_stories").select("*");
}

function buildStoryMap(rows: ShoeStoryRow[]): Map<string, ShoeStory> {
  const sorted = [...rows].sort((a, b) => {
    const at = a.created_at ? Date.parse(a.created_at) : 0;
    const bt = b.created_at ? Date.parse(b.created_at) : 0;
    return bt - at;
  });
  const storyByShoeId = new Map<string, ShoeStory>();
  for (const row of sorted) {
    if (!row.shoe_id || storyByShoeId.has(row.shoe_id)) continue;
    storyByShoeId.set(row.shoe_id, normalizeStory(row));
  }
  return storyByShoeId;
}

async function loadShoesBase(): Promise<ShoesBase | null> {
  const supabase = createPublicClient();
  if (!supabase) {
    console.warn(
      "[getShoesBase] Supabase public client unavailable — falling back to demo shoes. " +
        "Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the deployment environment."
    );
    return null;
  }

  const [shoesRes, ratingsRes, storiesRes] = await Promise.all([
    supabase
      .from("shoes")
      .select("*, shoe_specs(*), shoe_images(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("shoe_ratings")
      .select("shoe_id, cushioning_feel, court_feel, bounce, stability, traction, fit"),
    fetchStoryRows(supabase)
  ]);

  if (shoesRes.error) {
    console.error("[getShoesBase] supabase error", shoesRes.error);
    return null;
  }
  if (!shoesRes.data?.length) return null;

  let storyRows = (storiesRes.data ?? null) as ShoeStoryRow[] | null;
  if (storiesRes.error) {
    console.error("[getShoesBase] shoe_stories fetch failed", storiesRes.error);
  }

  // shoe_stories is public data, but the anon read can come back empty when a
  // restrictive RLS policy hides the table. Retry server-side with the
  // service-role client before giving up so manually inserted stories surface.
  if (!storyRows?.length) {
    const adminClient = createAdminClient();
    if (adminClient) {
      const retry = await fetchStoryRows(adminClient);
      if (retry.error) {
        console.error("[getShoesBase] shoe_stories service-role retry failed", retry.error);
      } else if (retry.data?.length) {
        console.warn("[getShoesBase] shoe_stories empty via public client; used service-role fallback");
        storyRows = retry.data as ShoeStoryRow[];
      }
    }
  }

  const storyByShoeId = buildStoryMap(storyRows ?? []);

  const rows: ShoeQueryRow[] = (shoesRes.data as Array<ShoeRow & { id: string }>).map((row) => ({
    ...row,
    story: storyByShoeId.get(row.id) ?? null
  }));

  const aggregates = new Map<string, DimAggregate>();
  for (const r of (ratingsRes.data ?? []) as DimRow[]) {
    const cur = aggregates.get(r.shoe_id) ?? { count: 0, sums: emptyDimRecord() };
    cur.count += 1;
    for (const k of DIM_KEYS) cur.sums[k] += Number(r[k] ?? 0);
    aggregates.set(r.shoe_id, cur);
  }

  return {
    rows,
    aggregates: Array.from(aggregates.entries())
  };
}

const getShoesBase = unstable_cache(loadShoesBase, ["shoes-base-v3"], {
  tags: ["shoes"],
  revalidate: 300
});

type UserContext = {
  myDimRatings: Map<string, Record<DimKey, number>>;
  focus: RatingFocus | null;
};

const EMPTY_USER_CONTEXT: UserContext = { myDimRatings: new Map(), focus: null };

async function loadUserContext(): Promise<UserContext> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return EMPTY_USER_CONTEXT;

    const supabase = await createClient();
    if (!supabase) return EMPTY_USER_CONTEXT;

    const { data: mineRows } = await supabase
      .from("shoe_ratings")
      .select("shoe_id, cushioning_feel, court_feel, bounce, stability, traction, fit")
      .eq("user_id", profile.id);

    const myDimRatings = new Map<string, Record<DimKey, number>>();
    for (const r of (mineRows ?? []) as DimRow[]) {
      const record = emptyDimRecord();
      for (const k of DIM_KEYS) record[k] = Number(r[k] ?? 0);
      myDimRatings.set(r.shoe_id, record);
    }

    const focus = isValidFocus(profile.rating_focus) ? profile.rating_focus : null;
    return { myDimRatings, focus };
  } catch (error) {
    if (isFrameworkError(error)) throw error;
    console.error("[loadUserContext] error", error);
    return EMPTY_USER_CONTEXT;
  }
}

function isFrameworkError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return digest === "DYNAMIC_SERVER_USAGE" || digest.startsWith("NEXT_");
}

function assembleShoes(base: ShoesBase, userCtx: UserContext): Shoe[] {
  const { rows, aggregates: aggregateEntries } = base;
  const { myDimRatings, focus } = userCtx;
  const aggregates = new Map<string, DimAggregate>(aggregateEntries);

  const specs = rows.map((row) => row.shoe_specs?.[0] ?? {});
  const dimStarsByIndex: (Partial<Record<DimKey, number>> | null)[] = rows.map(() => null);
  const finalStarsByIndex: (number | null)[] = rows.map(() => null);
  const specStarsByIndex: (number | null)[] = rows.map(() => null);

  if (focus) {
    const combinedByShoe: Record<DimKey, number>[] = rows.map((row, i) => {
      const agg = aggregates.get(row.id);
      const userDimAvg: Partial<Record<DimKey, number>> = {};
      if (agg && agg.count > 0) {
        for (const k of DIM_KEYS) userDimAvg[k] = agg.sums[k] / agg.count;
      }
      return combineDimScores(specs[i], userDimAvg, agg?.count ?? 0);
    });

    const weighted = combinedByShoe.map((c) => weightedCombinedScore(c, focus));
    const finalPercentiles = rankScoresToPercentiles(weighted);
    finalPercentiles.forEach((p, i) => {
      finalStarsByIndex[i] = percentileToStars(p);
    });

    // Spec-only stars (no user blending) for components that compare /
    // re-blend client-side.
    const specOnly = specs.map((spec) => weightedCombinedScore(dimScores(spec), focus));
    const specPercentiles = rankScoresToPercentiles(specOnly);
    specPercentiles.forEach((p, i) => {
      specStarsByIndex[i] = percentileToStars(p);
    });

    rows.forEach((_, i) => {
      dimStarsByIndex[i] = {};
    });
    for (const k of DIM_KEYS) {
      const dimScoresList = combinedByShoe.map((c) => c[k]);
      const dimPercentiles = rankScoresToPercentiles(dimScoresList);
      dimPercentiles.forEach((p, i) => {
        const target = dimStarsByIndex[i];
        if (target) target[k] = percentileToStars(p);
      });
    }
  }

  const built = rows.map((row, idx) => {
    const agg = aggregates.get(row.id);
    const userRatingCount = agg?.count ?? 0;
    return {
      ...row,
      image_url: resolveApprovedImage(row.shoe_images)?.public_url ?? null,
      spec: specs[idx],
      userRatingCount,
      specStars: specStarsByIndex[idx],
      finalStars: finalStarsByIndex[idx],
      dimStars: dimStarsByIndex[idx],
      myDimRatings: myDimRatings.get(row.id) ?? null
    };
  });

  // Guarantee every shoe has a unique, non-empty slug. Legacy/seeded rows can
  // carry an empty slug (a fully non-Latin name slugifies to "") or a duplicate
  // one; since getShoeBySlug() resolves by first match, those collisions make
  // several different shoes — and every link pointing at them — open the SAME
  // wrong shoe. Fall back to the row id, which is always unique.
  const seenSlugs = new Set<string>();
  for (const shoe of built) {
    let s = (shoe.slug ?? "").trim();
    if (!s || seenSlugs.has(s)) s = shoe.id;
    shoe.slug = s;
    seenSlugs.add(s);
  }

  return built;
}

export const getShoes = cache(async function getShoes(): Promise<Shoe[]> {
  const [base, userCtx] = await Promise.all([getShoesBase(), loadUserContext()]);
  if (!base) return demoShoes;
  return assembleShoes(base, userCtx);
});

// Public, non-personalized catalog (reads no cookies) — safe to cache and to
// serve from /api/shoes for the on-device (IndexedDB) library. Same shape as
// getShoes but with an empty user context, so no per-user blending/ordering.
export async function getPublicShoes(): Promise<Shoe[]> {
  const base = await getShoesBase();
  if (!base) return demoShoes;
  return assembleShoes(base, EMPTY_USER_CONTEXT);
}

export async function getShoeBySlug(slug: string): Promise<Shoe | null> {
  const shoes = await getShoes();
  // Resolve by slug first, then fall back to id so id-based links keep working
  // for any shoe whose slug had to be repaired above.
  return shoes.find((s) => s.slug === slug) ?? shoes.find((s) => s.id === slug) ?? null;
}

export async function getShoeImageState(shoeId: string, includePending: boolean): Promise<ShoeImageState> {
  const supabase = await createClient();
  if (!supabase) return { approved: null, pending: null, latestRejected: null };

  const { data } = await supabase
    .from("shoe_images")
    .select("*")
    .eq("shoe_id", shoeId)
    .in("status", includePending ? ["approved", "pending", "rejected"] : ["approved"])
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as ShoeImageRecord[];

  const approved =
    rows
      .filter((row) => row.status === "approved")
      .sort((a, b) => new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime())[0] ?? null;
  const pending = includePending ? rows.find((row) => row.status === "pending") ?? null : null;
  const latestRejected = includePending ? rows.find((row) => row.status === "rejected") ?? null : null;

  return { approved, pending, latestRejected };
}
