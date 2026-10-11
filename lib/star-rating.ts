import {
  getBounceScore,
  getCourtFeelScore,
  getCushioningFeelScore,
  getFitScore,
  getStabilityScore,
  getTractionScore,
  hasScoringSignal
} from "@/lib/shoe-scoring";
import type { ShoeSpec } from "@/lib/types";

export const STAR_MIN = 0.5;
export const STAR_MAX = 5;

export const DIM_KEYS = [
  "cushioning_feel",
  "court_feel",
  "bounce",
  "stability",
  "traction",
  "fit"
] as const;
export type DimKey = (typeof DIM_KEYS)[number];
export type EvidenceScores = Record<DimKey, number | null>;
export const COMMUNITY_PRIOR_COUNT = 5;

export const DIM_LABELS: Record<DimKey, string> = {
  cushioning_feel: "Cushioning feel",
  court_feel: "Court feel",
  bounce: "Bounce",
  stability: "Stability",
  traction: "Traction",
  fit: "Fit"
};

export type RatingFocus = {
  primary: DimKey;
  secondary: DimKey;
  tertiary: DimKey;
};

export const FOCUS_WEIGHTS = {
  primary: 0.4,
  secondary: 0.3,
  tertiary: 0.2,
  others: 0.1
} as const;

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function clampUserStars(value: number): number {
  return Math.max(STAR_MIN, Math.min(STAR_MAX, roundToHalf(value)));
}

export function dimScores(spec: ShoeSpec | null | undefined): Record<DimKey, number> {
  const safe: ShoeSpec = spec ?? {};
  return {
    cushioning_feel: getCushioningFeelScore(safe.cushioning_feel ?? ""),
    court_feel: getCourtFeelScore(safe.court_feel ?? ""),
    bounce: getBounceScore(safe.bounce ?? ""),
    stability: getStabilityScore(safe.stability ?? ""),
    traction: getTractionScore(safe.traction ?? ""),
    fit: getFitScore(safe.fit ?? "")
  };
}

export function isValidFocus(value: unknown): value is RatingFocus {
  if (!value || typeof value !== "object") return false;
  const f = value as Partial<Record<keyof RatingFocus, unknown>>;
  const keys: (keyof RatingFocus)[] = ["primary", "secondary", "tertiary"];
  for (const k of keys) {
    if (typeof f[k] !== "string") return false;
    if (!DIM_KEYS.includes(f[k] as DimKey)) return false;
  }
  const set = new Set([f.primary, f.secondary, f.tertiary]);
  return set.size === 3;
}

/** Only descriptions that actually exist can contribute to a rating. */
export function hasPerformanceEvidence(text: string | null | undefined): boolean {
  const value = text?.trim().toLowerCase();
  return Boolean(value && hasScoringSignal(value) && !/^(?:n\/?a|none|null|unknown|tbd|not (?:available|tested|yet added)|暂无|未知|待补充|未测试|[-—–]+)[.!。]?$/i.test(value));
}

export function evidenceDimScores(spec: ShoeSpec | null | undefined): EvidenceScores {
  const scores = dimScores(spec);
  return Object.fromEntries(DIM_KEYS.map(k => [k, hasPerformanceEvidence(spec?.[k]) ? scores[k] : null])) as EvidenceScores;
}

export function weightedSpecScore(spec: ShoeSpec | null | undefined, focus: RatingFocus): number | null {
  return overallEvidenceScore(evidenceDimScores(spec), focus);
}

export function weightedCombinedScore(combined: EvidenceScores, focus: RatingFocus): number | null {
  const weights: Record<DimKey, number> = Object.fromEntries(DIM_KEYS.map(k => [k, FOCUS_WEIGHTS.others / 3])) as Record<DimKey, number>;
  weights[focus.primary] = FOCUS_WEIGHTS.primary;
  weights[focus.secondary] = FOCUS_WEIGHTS.secondary;
  weights[focus.tertiary] = FOCUS_WEIGHTS.tertiary;
  let total = 0, weight = 0;
  for (const k of DIM_KEYS) {
    const value = combined[k];
    if (value == null || !Number.isFinite(value)) continue;
    total += value * weights[k]; weight += weights[k];
  }
  return weight ? total / weight : null;
}

export function equalWeightScore(combined: EvidenceScores): number | null {
  const values = DIM_KEYS.map(k => combined[k]).filter((v): v is number => v != null && Number.isFinite(v));
  return values.length ? values.reduce((a,b) => a+b,0) / values.length : null;
}

/** Five prior observations keep a single review from owning half the score. */
export function combineDimScores(
  spec: ShoeSpec | null | undefined,
  userDimAverages: Partial<Record<DimKey, number>> | null | undefined,
  userRatingCount: number,
  userDimCounts?: Partial<Record<DimKey, number>>
): EvidenceScores {
  const out = evidenceDimScores(spec);
  for (const k of DIM_KEYS) {
    const avg = userDimAverages?.[k];
    const n = userDimCounts?.[k] ?? userRatingCount;
    if (avg == null || !Number.isFinite(avg) || avg < STAR_MIN || avg > STAR_MAX || n < 1) continue;
    const prior = out[k];
    out[k] = prior == null ? avg * 20 : (prior * COMMUNITY_PRIOR_COUNT + avg * 20 * n) / (COMMUNITY_PRIOR_COUNT + n);
  }
  return out;
}

/** Require at least half the dimensions before publishing an overall score. */
export function overallEvidenceScore(scores: EvidenceScores, focus?: RatingFocus | null): number | null {
  if (DIM_KEYS.filter(k => scores[k] != null).length < 3) return null;
  return focus ? weightedCombinedScore(scores, focus) : equalWeightScore(scores);
}

export function percentileToStars(percentile: number): number {
  if (percentile < 0.03) return 1.0;
  if (percentile < 0.10) return 1.5;
  if (percentile < 0.20) return 2.0;
  if (percentile < 0.30) return 2.5;
  if (percentile < 0.45) return 3.0;
  if (percentile < 0.65) return 3.5;
  if (percentile < 0.80) return 4.0;
  if (percentile < 0.90) return 4.5;
  return 5.0;
}

/** Average ranks for ties; missing scores never enter the reference population. */
export function rankScoresToPercentiles(scores: readonly (number | null)[]): (number | null)[] {
  const indexed = scores.flatMap((s,i) => s != null && Number.isFinite(s) ? [{s,i}] : []);
  indexed.sort((a,b) => a.s-b.s);
  const out: (number | null)[] = scores.map(() => null);
  for (let start=0; start<indexed.length;) {
    let end=start+1;
    while (end<indexed.length && indexed[end].s===indexed[start].s) end++;
    const percentile = indexed.length===1 ? 0.5 : ((start+end-1)/2)/(indexed.length-1);
    for (let j=start;j<end;j++) out[indexed[j].i]=percentile;
    start=end;
  }
  return out;
}

// Map a 0-100 performance score onto the 1-5 star scale (linear).
function score100ToStars(score100: number): number {
  return 1 + (Math.max(0, Math.min(100, score100)) / 100) * 4;
}

/**
 * Recommendation star (strictly 1-5, in 0.5 steps): the average of the AI's
 * own recommendation star and a deterministic, preference-weighted spec score.
 * When the user has a valid Rating Focus we weight the six dimensions by it;
 * otherwise we fall back to an equal-weight average of the dimension scores.
 */
export function blendedRecommendationStars(
  aiStars: number,
  spec: ShoeSpec | null | undefined,
  focus: RatingFocus | null | undefined
): number | null {
  const score100 = overallEvidenceScore(evidenceDimScores(spec), focus);
  if (score100 == null) return null;
  const specStars = score100ToStars(score100);
  const ai = Math.max(1, Math.min(5, Number.isFinite(aiStars) ? aiStars : 3));
  return Math.max(1, Math.min(5, roundToHalf((ai + specStars) / 2)));
}

export function computeFinalStars(
  specStars: number,
  userAvg: number | null | undefined,
  userCount: number | null | undefined
): number {
  const count = userCount ?? 0;
  if (!userAvg || count < 1) return specStars;
  const blended = (COMMUNITY_PRIOR_COUNT * specStars + count * userAvg) / (COMMUNITY_PRIOR_COUNT + count);
  return Math.max(STAR_MIN, Math.min(STAR_MAX, roundToHalf(blended)));
}

/**
 * Legacy spec-only star derivation, kept so old callers without a focus can
 * still compute a baseline if needed. Production paths now go through
 * weightedSpecScore + rankScoresToPercentiles + percentileToStars.
 */
export function specScoreToStars(spec: ShoeSpec | null | undefined): number {
  const s = dimScores(spec);
  const avg100 =
    (s.cushioning_feel +
      s.court_feel +
      s.bounce +
      s.stability +
      s.traction +
      s.fit) /
    6;
  const rawStars = Math.pow(avg100 / 100, 3) * 5;
  return Math.max(STAR_MIN, Math.min(STAR_MAX, roundToHalf(rawStars)));
}
