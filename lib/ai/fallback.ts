import type { Shoe } from "@/lib/types";
import type { Persona } from "@/lib/persona/types";
import { computeMatchScore } from "@/lib/match/score";
import { rankShoeMatch } from "@/lib/search/shoe-search";
import { blendedRecommendationStars, evidenceDimScores, overallEvidenceScore, type RatingFocus } from "@/lib/star-rating";
import type { RecommendationRaw } from "@/lib/ai/types";

/** Conservative backup: do not invent a match when the query cannot be verified. */
export function pickFallbackShoes(opts: { shoes: Shoe[]; query: string; persona: Persona | null; focus: RatingFocus | null; count: number }): RecommendationRaw[] {
  const { shoes, query, persona, focus, count } = opts;
  if (count <= 0) return [];
  return shoes.flatMap(shoe => {
    const quality = overallEvidenceScore(evidenceDimScores(shoe.spec), focus);
    const relevance = rankShoeMatch(shoe, query);
    if (quality == null || (query.trim() && relevance <= 0)) return [];
    const fit = persona ? computeMatchScore(persona, shoe) : null;
    return [{ shoe, score: Math.max(0,relevance) + (fit ?? 0)*0.6 + quality*0.4 }];
  }).sort((a,b) => b.score-a.score || a.shoe.id.localeCompare(b.shoe.id))
    .slice(0,count).map(({shoe}) => ({
      shoe_id: shoe.id, stars: blendedRecommendationStars(3,shoe.spec,focus), reason:"", pros:[], cons:[]
    }));
}
