import type { Shoe } from "@/lib/types";
import {
  getBounceScore,
  getCourtFeelScore,
  getCushioningFeelScore,
  getFitScore,
  getStabilityScore,
  getTractionScore
} from "@/lib/shoe-scoring";
import { parseShoeWeightOz } from "@/lib/match/score";

// Structured browse facets for the database feed. Pure functions only — the UI
// (components/home/shoe-facets.tsx) and the feed both consume these, and they're
// cheap enough to run across the whole catalog on every keystroke.

export type CategoryBucket = "guard" | "wing" | "big" | "all";
export type EraBucket = "pre2010" | "2010s" | "2020s";
export type PerfFlag = "traction" | "cushion" | "bounce" | "court" | "stable" | "fit" | "light";

export type FacetState = {
  categories: CategoryBucket[]; // OR within the group
  eras: EraBucket[]; // OR within the group
  minStars: number; // 0 = any
  perf: PerfFlag[]; // AND across flags
};

export const EMPTY_FACETS: FacetState = { categories: [], eras: [], minStars: 0, perf: [] };

export const CATEGORY_BUCKETS: CategoryBucket[] = ["guard", "wing", "big", "all"];
export const ERA_BUCKETS: EraBucket[] = ["pre2010", "2010s", "2020s"];
export const PERF_FLAGS: PerfFlag[] = ["traction", "cushion", "bounce", "court", "stable", "fit", "light"];

// Mirrors the bucketing used by the personalization engine (lib/match/score.ts)
// so "Guard" here means the same thing it does for match scoring.
export function categoryBucket(shoe: Shoe): CategoryBucket | null {
  const cat = (shoe.category ?? "").toLowerCase();
  if (!cat) return null;
  if (cat.includes("all") || cat.includes("hybrid") || cat.includes("versatile")) return "all";
  if (cat.includes("guard")) return "guard";
  if (cat.includes("wing") || (cat.includes("forward") && !cat.includes("power"))) return "wing";
  if (cat.includes("big") || cat.includes("center") || cat.includes("power")) return "big";
  return null;
}

export function eraBucket(shoe: Shoe): EraBucket | null {
  const y = shoe.release_year;
  if (!y) return null;
  if (y < 2010) return "pre2010";
  if (y < 2020) return "2010s";
  return "2020s";
}

const PERF_PREDICATES: Record<PerfFlag, (shoe: Shoe) => boolean> = {
  traction: (s) => getTractionScore(s.spec.traction ?? "") >= 85,
  cushion: (s) => getCushioningFeelScore(s.spec.cushioning_feel ?? "") >= 85,
  bounce: (s) => getBounceScore(s.spec.bounce ?? "") >= 85,
  court: (s) => getCourtFeelScore(s.spec.court_feel ?? "") >= 85,
  stable: (s) => getStabilityScore(s.spec.stability ?? "") >= 85,
  fit: (s) => getFitScore(s.spec.fit ?? "") >= 85,
  light: (s) => {
    const oz = parseShoeWeightOz(s.weight);
    return oz != null && oz <= 12;
  }
};

export function matchesFacets(shoe: Shoe, f: FacetState): boolean {
  if (f.categories.length) {
    const b = categoryBucket(shoe);
    if (!b || !f.categories.includes(b)) return false;
  }
  if (f.eras.length) {
    const e = eraBucket(shoe);
    if (!e || !f.eras.includes(e)) return false;
  }
  if (f.minStars > 0 && (shoe.finalStars ?? 0) < f.minStars) return false;
  for (const flag of f.perf) {
    if (!PERF_PREDICATES[flag](shoe)) return false;
  }
  return true;
}

export function facetCount(f: FacetState): number {
  return f.categories.length + f.eras.length + (f.minStars > 0 ? 1 : 0) + f.perf.length;
}

// Per-shoe precomputed facet data. The performance predicates run the regex
// scoring engine, so we compute them ONCE per catalog (buildFacetIndex) and let
// the feed filter against the cheap booleans on every keystroke / toggle.
export type FacetIndexEntry = {
  category: CategoryBucket | null;
  era: EraBucket | null;
  stars: number;
  perf: Record<PerfFlag, boolean>;
};

export function buildFacetIndex(shoes: Shoe[]): Map<string, FacetIndexEntry> {
  const map = new Map<string, FacetIndexEntry>();
  for (const s of shoes) {
    map.set(s.id, {
      category: categoryBucket(s),
      era: eraBucket(s),
      stars: s.finalStars ?? 0,
      perf: {
        traction: PERF_PREDICATES.traction(s),
        cushion: PERF_PREDICATES.cushion(s),
        bounce: PERF_PREDICATES.bounce(s),
        court: PERF_PREDICATES.court(s),
        stable: PERF_PREDICATES.stable(s),
        fit: PERF_PREDICATES.fit(s),
        light: PERF_PREDICATES.light(s)
      }
    });
  }
  return map;
}

export function matchesIndexed(entry: FacetIndexEntry | undefined, f: FacetState): boolean {
  if (!entry) return true;
  if (f.categories.length && (!entry.category || !f.categories.includes(entry.category))) return false;
  if (f.eras.length && (!entry.era || !f.eras.includes(entry.era))) return false;
  if (f.minStars > 0 && entry.stars < f.minStars) return false;
  for (const flag of f.perf) {
    if (!entry.perf[flag]) return false;
  }
  return true;
}

/** Which buckets actually exist in the catalog, so the UI never shows a chip
 *  that can only ever return zero results. */
export function availableFacets(shoes: Shoe[]) {
  const categories = new Set<CategoryBucket>();
  const eras = new Set<EraBucket>();
  let hasWeight = false;
  for (const s of shoes) {
    const c = categoryBucket(s);
    if (c) categories.add(c);
    const e = eraBucket(s);
    if (e) eras.add(e);
    if (!hasWeight && parseShoeWeightOz(s.weight) != null) hasWeight = true;
  }
  return { categories, eras, hasWeight };
}
