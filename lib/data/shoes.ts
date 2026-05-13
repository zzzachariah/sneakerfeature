import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
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

type ShoeRow = Omit<Shoe, "spec"> & { shoe_specs: ShoeSpec[] | null; shoe_images?: ShoeImageRecord[] | null };
type ShoeStory = NonNullable<Shoe["story"]>;
type ShoeQueryRow = ShoeRow & { shoe_stories: ShoeStory[] | null };
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

async function loadShoesBase(): Promise<ShoesBase | null> {
  const supabase = createPublicClient();
  if (!supabase) {
    console.warn(
      "[getShoesBase] Supabase public client unavailable — falling back to demo shoes. " +
        "Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the deployment environment."
    );
    return null;
  }

  const [shoesRes, ratingsRes] = await Promise.all([
    supabase
      .from("shoes")
      .select("*, shoe_specs(*), shoe_stories(*), shoe_images(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("shoe_ratings")
      .select("shoe_id, cushioning_feel, court_feel, bounce, stability, traction, fit")
  ]);

  if (shoesRes.error) {
    console.error("[getShoesBase] supabase error", shoesRes.error);
    return null;
  }
  if (!shoesRes.data?.length) return null;

  const aggregates = new Map<string, DimAggregate>();
  for (const r of (ratingsRes.data ?? []) as DimRow[]) {
    const cur = aggregates.get(r.shoe_id) ?? { count: 0, sums: emptyDimRecord() };
    cur.count += 1;
    for (const k of DIM_KEYS) cur.sums[k] += Number(r[k] ?? 0);
    aggregates.set(r.shoe_id, cur);
  }

  return {
    rows: shoesRes.data as ShoeQueryRow[],
    aggregates: Array.from(aggregates.entries())
  };
}

const getShoesBase = unstable_cache(loadShoesBase, ["shoes-base-v1"], {
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

export const getShoes = cache(async function getShoes(): Promise<Shoe[]> {
  const [base, userCtx] = await Promise.all([getShoesBase(), loadUserContext()]);
  if (!base) return demoShoes;

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

  return rows.map((row, idx) => {
    const agg = aggregates.get(row.id);
    const userRatingCount = agg?.count ?? 0;
    return {
      ...row,
      image_url: resolveApprovedImage(row.shoe_images)?.public_url ?? null,
      spec: specs[idx],
      story: row.shoe_stories?.[0] ?? null,
      userRatingCount,
      specStars: specStarsByIndex[idx],
      finalStars: finalStarsByIndex[idx],
      dimStars: dimStarsByIndex[idx],
      myDimRatings: myDimRatings.get(row.id) ?? null
    };
  });
});

export async function getShoeBySlug(slug: string): Promise<Shoe | null> {
  const shoes = await getShoes();
  return shoes.find((s) => s.slug === slug) ?? null;
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
