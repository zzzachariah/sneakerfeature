import type { Shoe } from "@/lib/types";
import type { Persona } from "@/lib/persona/types";
import { computeMatchScore } from "@/lib/match/score";
import { rankShoeMatch } from "@/lib/search/shoe-search";
import { blendedRecommendationStars, dimScores, weightedSpecScore, DIM_KEYS, type RatingFocus } from "@/lib/star-rating";
import type { RecommendationRaw } from "@/lib/ai/types";

// Equal-weight average of the six 0-100 dimension scores — the "no Rating Focus"
// baseline for a shoe's all-round spec quality.
function avgSpecQuality(shoe: Shoe): number {
  const d = dimScores(shoe.spec);
  return DIM_KEYS.reduce((sum, k) => sum + d[k], 0) / DIM_KEYS.length;
}

/**
 * Deterministic, never-empty safety net. Runs only when every AI strategy has
 * failed to produce a single catalog-matchable shoe. Picks the top-N most
 * suitable shoes straight from the catalog so the user ALWAYS gets cards.
 *
 * Uses only existing, side-effect-free scoring utilities and invents nothing:
 * - rankShoeMatch: keyword/name/tech/tag relevance to the user's words.
 * - computeMatchScore: persona fit (position/weight/flat-foot/skill/height).
 * - weightedSpecScore / dimScores: objective spec quality (focus-weighted or flat).
 * reason/pros/cons are left empty (no fabrication); the card still renders its
 * radar, tech, stars and image from the catalog via enrichRecommendations.
 */
export function pickFallbackShoes(opts: {
  shoes: Shoe[];
  query: string;
  persona: Persona | null;
  focus: RatingFocus | null;
  count: number;
}): RecommendationRaw[] {
  const { shoes, query, persona, focus, count } = opts;
  if (!shoes.length || count <= 0) return [];

  const scored = shoes.map((shoe) => {
    const rel = Math.max(0, rankShoeMatch(shoe, query)); // -1 (no match) → 0
    const personaFit = persona ? computeMatchScore(persona, shoe) : 50; // 30-99, or neutral
    const specQuality = focus ? weightedSpecScore(shoe.spec, focus) : avgSpecQuality(shoe); // 0-100
    // Relevance leads; persona fit and spec quality ensure the picks are
    // sensible (and break ties) when the query has no recognizable keywords.
    const score = rel * 1.0 + personaFit * 0.6 + specQuality * 0.4;
    return { shoe, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const fa = a.shoe.finalStars ?? a.shoe.specStars ?? 0;
    const fb = b.shoe.finalStars ?? b.shoe.specStars ?? 0;
    if (fb !== fa) return fb - fa;
    return a.shoe.id.localeCompare(b.shoe.id); // stable, deterministic
  });

  return scored.slice(0, count).map(({ shoe }) => ({
    shoe_id: shoe.id,
    stars: blendedRecommendationStars(3, shoe.spec, focus),
    reason: "",
    pros: [],
    cons: []
  }));
}
