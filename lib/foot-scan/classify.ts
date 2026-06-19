// Deterministic classification + helpers that turn raw vision read-outs into the
// final foot traits. Keeping classification here (not in the model) means the
// boundaries are explicit and tunable; every threshold comes from config.ts so
// they can be retuned against a validation set without touching this logic.

import type { HalluxClass, InstepClass, WidthClass, FootSide } from "@/lib/foot-scan/types";
import { FOOT_SCAN_CONFIG, halluxAngleFromRatio } from "@/lib/foot-scan/config";

// Width / length ratio → class. Population average sits ~0.38-0.40; the bands
// are intentionally coarse (4 buckets) and are the prime knob to retune.
export function widthClassFromRatio(ratio: number): WidthClass {
  const w = FOOT_SCAN_CONFIG.width;
  if (ratio < w.narrowBelow) return "narrow";
  if (ratio < w.standardBelow) return "standard";
  if (ratio < w.wideBelow) return "wide";
  return "extra_wide";
}

// Hallux d/h ( = sin of the external appearance angle) → screening band.
export function halluxClassFromRatio(ratio: number): HalluxClass {
  const h = FOOT_SCAN_CONFIG.hallux;
  if (ratio >= h.moderatePlusAbove) return "moderate_plus";
  if (ratio >= h.mildAbove) return "mild";
  return "none";
}

// Re-export the angle helper so callers import classification + angle together.
export { halluxAngleFromRatio };

// Arch-height index AHI = Hd/TL → instep class. Used to refine the model's
// qualitative read when a usable side-view measurement exists.
export function instepClassFromAhi(ahi: number): InstepClass {
  const a = FOOT_SCAN_CONFIG.ahi;
  if (ahi < a.lowBelow) return "low";
  if (ahi > a.highAbove) return "high";
  return "normal";
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
  const { min, max } = FOOT_SCAN_CONFIG.ratioBounds;
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return null;
  if (ratio < min || ratio > max) return null;
  return ratio;
}
