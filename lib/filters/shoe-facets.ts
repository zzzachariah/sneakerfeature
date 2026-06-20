import type { Shoe } from "@/lib/types";
import {
  getCushioningFeelScore,
  getStabilityScore,
  getTractionScore
} from "@/lib/shoe-scoring";
import { parseShoeWeightOz } from "@/lib/match/score";

// Structured browse facets for the database feed. Pure functions only — the UI
// (components/home/shoe-facets.tsx) and the feed both consume these, and they're
// cheap enough to run across the whole catalog on every keystroke.

export type CategoryBucket = "guard" | "wing" | "big" | "all";
export type EraBucket = "pre2010" | "2010s" | "2020s";
export type PerfFlag = "traction" | "cushion" | "stable" | "light";

export type FacetState = {
  categories: CategoryBucket[]; // OR within the group
  eras: EraBucket[]; // OR within the group
  minStars: number; // 0 = any
  perf: PerfFlag[]; // AND across flags
};

export const EMPTY_FACETS: FacetState = { categories: [], eras: [], minStars: 0, perf: [] };

export const CATEGORY_BUCKETS: CategoryBucket[] = ["guard", "wing", "big", "all"];
export const ERA_BUCKETS: EraBucket[] = ["pre2010", "2010s", "2020s"];
export const PERF_FLAGS: PerfFlag[] = ["traction", "cushion", "stable", "light"];

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
  stable: (s) => getStabilityScore(s.spec.stability ?? "") >= 85,
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
