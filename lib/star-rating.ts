import {
  getBounceScore,
  getCourtFeelScore,
  getCushioningFeelScore,
  getFitScore,
  getStabilityScore,
  getTractionScore
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

export function weightedSpecScore(
  spec: ShoeSpec | null | undefined,
  focus: RatingFocus
): number {
  return weightedCombinedScore(dimScores(spec), focus);
}

export function weightedCombinedScore(
  combined: Record<DimKey, number>,
  focus: RatingFocus
): number {
  const picked = new Set<DimKey>([focus.primary, focus.secondary, focus.tertiary]);
  const others = DIM_KEYS.filter((k) => !picked.has(k));
  const otherWeight = others.length > 0 ? FOCUS_WEIGHTS.others / others.length : 0;
  return (
    combined[focus.primary] * FOCUS_WEIGHTS.primary +
    combined[focus.secondary] * FOCUS_WEIGHTS.secondary +
    combined[focus.tertiary] * FOCUS_WEIGHTS.tertiary +
    others.reduce((sum, k) => sum + combined[k] * otherWeight, 0)
  );
}

/**
 * Blend spec-derived 0-100 dim scores with average user dim ratings (0.5-5
 * stars, scaled by ×20 to align with the 0-100 spec scale). When no users
 * have rated a shoe, fall back to spec-only.
 */
export function combineDimScores(
  spec: ShoeSpec | null | undefined,
  userDimAverages: Partial<Record<DimKey, number>> | null | undefined,
  userRatingCount: number
): Record<DimKey, number> {
  const specScores = dimScores(spec);
  if (!userDimAverages || userRatingCount < 1) return specScores;
  const out = {} as Record<DimKey, number>;
  for (const k of DIM_KEYS) {
    const userAvgStars = userDimAverages[k];
    if (userAvgStars === undefined || userAvgStars === null) {
      out[k] = specScores[k];
    } else {
      out[k] = 0.5 * specScores[k] + 0.5 * userAvgStars * 20;
    }
  }
  return out;
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

export function rankScoresToPercentiles(scores: number[]): number[] {
  const n = scores.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];
  const indexed = scores.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => a.s - b.s || a.i - b.i);
  const out = new Array<number>(n);
  for (let r = 0; r < indexed.length; r++) {
    out[indexed[r].i] = r / (n - 1);
  }
  return out;
}

export function computeFinalStars(
  specStars: number,
  userAvg: number | null | undefined,
  userCount: number | null | undefined
): number {
  const count = userCount ?? 0;
  if (!userAvg || count < 1) return specStars;
  const blended = 0.5 * specStars + 0.5 * userAvg;
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
