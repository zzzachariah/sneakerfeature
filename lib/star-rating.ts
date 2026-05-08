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

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function clampUserStars(value: number): number {
  return Math.max(STAR_MIN, Math.min(STAR_MAX, roundToHalf(value)));
}

export function specScoreToStars(spec: ShoeSpec | null | undefined): number {
  const safe: ShoeSpec = spec ?? {};
  const scores = [
    getStabilityScore(safe.stability ?? ""),
    getTractionScore(safe.traction ?? ""),
    getFitScore(safe.fit ?? ""),
    getCushioningFeelScore(safe.cushioning_feel ?? ""),
    getCourtFeelScore(safe.court_feel ?? ""),
    getBounceScore(safe.bounce ?? "")
  ];
  const avg100 = scores.reduce((a, b) => a + b, 0) / scores.length;
  const rawStars = Math.pow(avg100 / 100, 3) * 5;
  return Math.max(STAR_MIN, Math.min(STAR_MAX, roundToHalf(rawStars)));
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
