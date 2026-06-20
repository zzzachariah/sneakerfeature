// Semantic tone for a 0–100 performance score.
//
// The four buckets are a coarser grouping of getPerformanceLabel()'s eight
// tiers (lib/shoe-scoring.ts), so the colour a shoe gets always agrees with the
// word it's labelled with:
//   elite ← Elite / Excellent      (85–100)
//   high  ← Very Good / Good        (65–84)
//   mid   ← Solid / Decent          (40–64)
//   low   ← Below Average / Weak    (0–39)
//
// Colours resolve to the --score-* CSS custom properties defined in
// app/globals.css (tuned separately for light and dark), so callers never
// hard-code a hue and the palette stays theme-correct on web + iOS glass.

export type ScoreTone = "elite" | "high" | "mid" | "low";

export function scoreTone(score: number): ScoreTone {
  if (score >= 85) return "elite";
  if (score >= 65) return "high";
  if (score >= 40) return "mid";
  return "low";
}

/** `rgb(var(--score-…))`, optionally with an alpha (0–1). */
export function toneColor(tone: ScoreTone, alpha?: number): string {
  const ref = `var(--score-${tone})`;
  return alpha == null ? `rgb(${ref})` : `rgb(${ref} / ${alpha})`;
}

/** Convenience: tone colour straight from a 0–100 score. */
export function scoreColor(score: number, alpha?: number): string {
  return toneColor(scoreTone(score), alpha);
}

/** Star ratings are 0–5; map onto the same 0–100 tone scale (5★ → elite). */
export function starTone(stars: number): ScoreTone {
  return scoreTone(stars * 20);
}

export function starColor(stars: number, alpha?: number): string {
  return toneColor(starTone(stars), alpha);
}
