import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { demoShoes } from "@/lib/data/demo-shoes";
import { readAllRows } from "@/lib/data/paginate";
import { displayBrand, inspectSpecs, publicSpec, selectSpecVersion, type SpecVersion } from "@/lib/data/catalog-quality";
import { getCurrentProfile } from "@/lib/data/auth";
import { Shoe, ShoeImageRecord } from "@/lib/types";
import {
  combineDimScores,
  DIM_KEYS,
  evidenceDimScores,
  overallEvidenceScore,
  isValidFocus,
  percentileToStars,
  rankScoresToPercentiles,
  type EvidenceScores,
  type DimKey,
  type RatingFocus
} from "@/lib/star-rating";

type CatalogImage = Pick<ShoeImageRecord, "id" | "status" | "public_url" | "approved_at" | "created_at">;
type ShoeRow = Omit<Shoe, "spec" | "story"> & { shoe_specs: SpecVersion[] | null; shoe_images?: CatalogImage[] | null };
type ShoeStory = NonNullable<Shoe["story"]>;
// Cached/assembled row: spec + approved image already resolved, the raw
// shoe_specs / shoe_images arrays dropped. Those arrays (every historical
// image record with prompts/rejection reasons, per shoe) used to ride along
// via object spread into BOTH the unstable_cache entry — pushing it past the
// 2MB data-cache limit, so the catalog silently never cached and every
// request re-scanned Supabase — AND into every page's RSC payload.
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
type ShoeQueryRow = Omit<Shoe, "story"> & { story: ShoeStory | null };
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
  dimCounts: Record<DimKey, number>;
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

function resolveApprovedImage(images?: CatalogImage[] | null) {
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

// Thrown when the live catalog can't be loaded. We THROW rather than return null
// so unstable_cache does NOT persist the failure: a cached null would be served
// (→ demo shoes) to every visitor for up to `revalidate` seconds after a single
// transient Supabase blip. Throwing leaves the cache empty, so the very next
// request retries Supabase instead of being stuck on the 3 demo shoes. Callers
// propagate the failure to the retry boundary. Demo data requires explicit development opt-in.
class CatalogUnavailableError extends Error {
  constructor(reason: string) {
    super(`catalog unavailable: ${reason}`);
    this.name = "CatalogUnavailableError";
  }
}

async function loadShoesBase(): Promise<ShoesBase> {
  const supabase = createPublicClient();
  if (!supabase) {
    console.warn(
      "[getShoesBase] Supabase public client unavailable. " +
        "Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the deployment environment."
    );
    throw new CatalogUnavailableError("public client unavailable");
  }

  const [catalogRows, ratingRows] = await Promise.all([
    readAllRows<ShoeRow>((from, to) => supabase.from("shoes")
      .select("id,slug,brand,shoe_name,model_line,version_name,release_year,category,player,price,weight,shoe_specs(*),shoe_images(id,status,public_url,approved_at,created_at)")
      .eq("shoe_images.status", "approved")
      .order("created_at", {ascending:false}).order("id")
      .order("approved_at", {referencedTable:"shoe_images",ascending:false})
      .limit(1,{referencedTable:"shoe_images"}).range(from,to)),
    readAllRows<{shoe_id:string;rating_count:number;sums:Record<DimKey,number>;dim_counts:Record<DimKey,number>}>((from,to) =>
      supabase.rpc("catalog_rating_summary").order("shoe_id").range(from,to))
  ]);

  const rows: ShoeQueryRow[] = catalogRows.map((row) => {
    const { shoe_specs, shoe_images, ...rest } = row;
    return {
      ...rest,
      brand: displayBrand(rest.brand),
      spec: publicSpec(shoe_specs),
      dataQuality: { issues: inspectSpecs(shoe_specs), updatedAt: selectSpecVersion(shoe_specs).updated_at ?? null },
      image_url: resolveApprovedImage(shoe_images)?.public_url ?? null,
      story: null
    };
  });

  const aggregates = new Map<string, DimAggregate>(ratingRows.map(row => [row.shoe_id, {
    count: Number(row.rating_count), sums: row.sums, dimCounts: row.dim_counts
  }]));

  return {
    rows,
    aggregates: Array.from(aggregates.entries())
  };
}

const getShoesBase = unstable_cache(loadShoesBase, ["shoes-base-v7"], {
  tags: ["shoes"],
  // Auto-refresh at most once a minute so edits made directly in Supabase (which
  // don't call revalidateTag) still show up within ~60s instead of going stale.
  // App-side admin writes still bust this instantly via revalidateTag("shoes").
  revalidate: 60
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

    const mineRows = await readAllRows<DimRow>((from,to) => supabase.from("shoe_ratings")
      .select("shoe_id,cushioning_feel,court_feel,bounce,stability,traction,fit")
      .eq("user_id",profile.id).order("shoe_id").range(from,to));

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

  const specs = rows.map((row) => row.spec ?? {});
  const dimStarsByIndex: (Partial<Record<DimKey, number>> | null)[] = rows.map(() => null);
  const finalStarsByIndex: (number | null)[] = rows.map(() => null);
  const specStarsByIndex: (number | null)[] = rows.map(() => null);

  {
    // Rank only observed dimensions. Overall estimates require at least three
    // dimensions, and equal scores share an average rank in the catalog.
    const scoreOf = (c: EvidenceScores) => overallEvidenceScore(c, focus);

    const combinedByShoe: EvidenceScores[] = rows.map((row, i) => {
      const agg = aggregates.get(row.id);
      const userDimAvg: Partial<Record<DimKey, number>> = {};
      if (agg && agg.count > 0) {
        for (const k of DIM_KEYS) if (agg.dimCounts[k]) userDimAvg[k] = agg.sums[k] / agg.dimCounts[k];
      }
      return combineDimScores(specs[i], userDimAvg, agg?.count ?? 0, agg?.dimCounts);
    });

    const weighted = combinedByShoe.map(scoreOf);
    const finalPercentiles = rankScoresToPercentiles(weighted);
    finalPercentiles.forEach((p, i) => {
      finalStarsByIndex[i] = p == null ? null : percentileToStars(p);
    });

    // Spec-only stars (no user blending) for components that compare /
    // re-blend client-side.
    const specOnly = specs.map((spec) => scoreOf(evidenceDimScores(spec)));
    const specPercentiles = rankScoresToPercentiles(specOnly);
    specPercentiles.forEach((p, i) => {
      specStarsByIndex[i] = p == null ? null : percentileToStars(p);
    });

    rows.forEach((_, i) => {
      dimStarsByIndex[i] = {};
    });
    for (const k of DIM_KEYS) {
      const dimScoresList = combinedByShoe.map((c) => c[k]);
      const dimPercentiles = rankScoresToPercentiles(dimScoresList);
      dimPercentiles.forEach((p, i) => {
        const target = dimStarsByIndex[i];
        if (target && p != null) target[k] = percentileToStars(p);
      });
    }
  }

  const built = rows.map((row, idx) => {
    const agg = aggregates.get(row.id);
    const userRatingCount = agg?.count ?? 0;
    return {
      ...row,
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

// Fully assembled non-personalized catalog, cached alongside the base data.
// assembleShoes runs ~8 full-catalog sorts (percentile ranking per dimension),
// which used to execute on EVERY request even when the base was a cache hit.
// For anonymous viewers (no focus, no own ratings) the result is identical for
// everyone, so cache the assembled output and skip that CPU in the hot path.
const getPublicShoesAssembled = unstable_cache(
  async () => {
    // Use the cached base loader, not loadShoesBase directly — otherwise every
    // assembled-cache miss triggers its own full-table base fetch in addition to
    // the one behind getShoesBase, doubling the catalog scan. getShoesBase throws
    // on failure (so the failure isn't cached); we let it propagate here so this
    // assembled entry isn't cached either — the boundary callers fall back.
    const base = await getShoesBase();
    return assembleShoes(base, EMPTY_USER_CONTEXT);
  },
  ["shoes-assembled-v4"],
  { tags: ["shoes"], revalidate: 60 }
);

// Distinguishes a Next.js framework control-flow error (dynamic server usage /
// redirect / notFound), which must propagate, from a real catalog failure, which
// we swallow into the demo fallback.
function fallbackToDemo(context: string, error: unknown): Shoe[] {
  if (isFrameworkError(error)) throw error;
  console.error(`[${context}] catalog unavailable`, error);
  if (process.env.NODE_ENV !== "production" && process.env.SNEAKER_DEMO_MODE === "1") return demoShoes;
  throw error;

}

export const getShoes = cache(async function getShoes(): Promise<Shoe[]> {
  const userCtx = await loadUserContext();
  try {
    // Anonymous / non-personalized viewers all see the same catalog — serve the
    // cached assembled list instead of recomputing rankings per request.
    if (!userCtx.focus && userCtx.myDimRatings.size === 0) {
      return await getPublicShoesAssembled();
    }
    const base = await getShoesBase();
    return assembleShoes(base, userCtx);
  } catch (error) {
    return fallbackToDemo("getShoes", error);
  }
});

// Public, non-personalized catalog (reads no cookies) — safe to cache and to
// serve from /api/shoes for the on-device (IndexedDB) library. Same shape as
// getShoes but with an empty user context, so no per-user blending/ordering.
export async function getPublicShoes(): Promise<Shoe[]> {
  try {
    return await getPublicShoesAssembled();
  } catch (error) {
    return fallbackToDemo("getPublicShoes", error);
  }
}

const getStoryForShoe = unstable_cache(async (id: string) => {
  const db = createPublicClient();
  if (!db) return null;
  const {data,error} = await db.from("shoe_stories")
    .select("shoe_id,title,content,title_zh,content_zh,source_label,source_url,created_at")
    .eq("shoe_id", id).order("created_at", {ascending:false}).order("id").limit(1);
  if (error) throw new CatalogUnavailableError("story query failed");
  return buildStoryMap((data ?? []) as ShoeStoryRow[]).get(id) ?? null;
}, ["shoe-story-v1"], {tags:["shoes"],revalidate:60});

export const getShoeBySlug = cache(async (slug: string): Promise<Shoe | null> => {
  // Keep catalog-wide ranks consistent; only story content is fetched on detail.
  const shoes = await getShoes();
  const shoe = shoes.find(s => s.slug === slug) ?? shoes.find(s => s.id === slug);
  return shoe ? {...shoe,story:await getStoryForShoe(shoe.id)} : null;
});

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
