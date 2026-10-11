import type { Shoe } from "@/lib/types";
import type { Persona } from "@/lib/persona/types";
import { computeMatchScore, getMatchReasons } from "@/lib/match/score";
import { evidenceDimScores, overallEvidenceScore, type DimKey } from "@/lib/star-rating";

/** If profile evidence is absent, offer an explicitly non-personal catalog shortlist. */
export function quickPickerResults(shoes: Shoe[], persona: Persona | null, priority: DimKey | null) {
  if (!persona) return [];
  const observed = shoes.map(shoe => ({shoe, evidence: evidenceDimScores(shoe.spec)}))
    .filter(({evidence}) => priority == null || evidence[priority] != null);
  const personal = observed.map(({shoe, evidence}) => {
    const score = computeMatchScore(persona, shoe);
    return {shoe, score, rank: score == null ? null : priority ? Math.round(score * 0.6 + evidence[priority]! * 0.4) : score, reasons: getMatchReasons(persona,shoe)};
  }).filter(row => row.score != null);
  if (personal.length) return personal.sort((a,b) => b.rank! - a.rank! || a.shoe.id.localeCompare(b.shoe.id)).slice(0,12);
  return observed.flatMap(({shoe,evidence}) => {
    const overall = overallEvidenceScore(evidence);
    if (overall == null) return [];
    return [{shoe,score:null,rank:priority ? evidence[priority]! : overall,reasons:["Shortlisted by recorded performance; personal match unavailable"]}];
  }).sort((a,b) => b.rank - a.rank || a.shoe.id.localeCompare(b.shoe.id)).slice(0,12);
}
