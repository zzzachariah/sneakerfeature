import type { Shoe } from "@/lib/types";
import { categoryBucket } from "@/lib/filters/shoe-facets";
import {
  getCourtFeelScore,
  getCushioningFeelScore,
  getStabilityScore,
  getTractionScore
} from "@/lib/shoe-scoring";
import { parseShoeWeightOz } from "@/lib/match/score";

// Curated "scene" collections for the homepage. Computed server-side (zero
// client cost) and passed down as id lists; the client resolves ids against the
// catalog it already has, so the RSC payload stays small.
export type HomeCollection = { id: string; title: string; shoeIds: string[] };

const LIMIT = 12;

function topBy(list: Shoe[], score: (s: Shoe) => number): string[] {
  return [...list]
    .map((s) => ({ s, k: score(s) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, LIMIT)
    .map((x) => x.s.id);
}

export function buildCollections(shoes: Shoe[]): HomeCollection[] {
  const guards = topBy(
    shoes.filter((s) => categoryBucket(s) === "guard"),
    (s) => getTractionScore(s.spec.traction ?? "")
  );
  const bigs = topBy(
    shoes.filter((s) => categoryBucket(s) === "big"),
    (s) => getStabilityScore(s.spec.stability ?? "") + getCushioningFeelScore(s.spec.cushioning_feel ?? "")
  );
  const light = topBy(
    shoes.filter((s) => {
      const oz = parseShoeWeightOz(s.weight);
      return oz != null && oz <= 12;
    }),
    (s) => getCourtFeelScore(s.spec.court_feel ?? "")
  );
  const top = [...shoes]
    .filter((s) => s.finalStars != null)
    .sort((a, b) => (b.finalStars ?? 0) - (a.finalStars ?? 0))
    .slice(0, LIMIT)
    .map((s) => s.id);

  return [
    { id: "guards", title: "Guards: speed & grip", shoeIds: guards },
    { id: "bigs", title: "Big-man protection", shoeIds: bigs },
    { id: "light", title: "Lightweight & quick", shoeIds: light },
    { id: "top", title: "Top rated", shoeIds: top }
  ].filter((c) => c.shoeIds.length >= 4);
}
