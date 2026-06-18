// Deterministic classification + helpers that turn raw vision read-outs into the
// final foot traits. Keeping width classification here (not in the model) means
// the boundaries are explicit and tunable against a validation set later.

import type { WidthClass, FootSide } from "@/lib/foot-scan/types";

// Width / length ratio thresholds. Population average sits ~0.38-0.40; these
// bands are intentionally coarse (4 buckets) and are the prime knobs to retune
// once the validation set exists.
export function widthClassFromRatio(ratio: number): WidthClass {
  if (ratio < 0.37) return "narrow";
  if (ratio < 0.41) return "standard";
  if (ratio < 0.45) return "wide";
  return "extra_wide";
}

// width_mm = ratio × length_mm. Rounded to the nearest mm.
export function widthMmFromRatio(ratio: number, lengthMm: number): number {
  return Math.round(ratio * lengthMm);
}

export function otherSide(side: FootSide): FootSide {
  return side === "left" ? "right" : "left";
}

// Clamp a model-reported ratio to a sane foot range so a hallucinated value
// can't produce an absurd classification.
export function sanitizeRatio(ratio: unknown): number | null {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return null;
  if (ratio < 0.25 || ratio > 0.6) return null;
  return ratio;
}
