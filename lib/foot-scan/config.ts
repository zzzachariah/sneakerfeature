// Central, tunable configuration for the Foot Scan.
//
// Every threshold and knob lives here instead of being buried in algorithm code
// (principle P6 / §7 of the spec): the boundaries stay explicit and can be
// retuned against a validation set without touching logic. The numbers are
// placeholders seeded from population norms — see README "Calibration" for how
// to fit them on real data.
//
// This module is imported on BOTH the client (capture-time quality gate) and the
// server (analysis). Keep it free of `process.env` so it is safe in the client
// bundle; server-only env overrides are applied where the value is read (see
// analyze.ts).

export const FOOT_SCAN_CONFIG = {
  // --- Self-consistency sampling (server) ---
  sampling: {
    // Default reads per scan; analyze.ts may override from FOOT_SCAN_SAMPLES.
    count: 3,
    // Hard ceiling for adaptive top-ups when early reads disagree.
    maxCount: 5,
    temperature: 0.5,
    // If the width ratio spread across the initial reads exceeds this, the
    // adaptive sampler fires one extra batch (up to maxCount) to settle it.
    expandRatioSpread: 0.05
  },

  // --- Width: W/L ratio band edges (upper-exclusive) ---
  // Population average sits ~0.38–0.40. Coarse on purpose; the prime knob.
  width: {
    narrowBelow: 0.37, // < 0.37 → narrow
    standardBelow: 0.41, // < 0.41 → standard
    wideBelow: 0.45 // < 0.45 → wide, else extra_wide
  },

  // --- Hallux valgus (SCREENING ONLY, not a diagnosis) ---
  // Expressed as d/h = sin(external appearance angle). The on-camera "external"
  // angle runs ~5–8° below a radiographic HVA, so these bands are deliberately
  // conservative (see spec §5/§7). d/h: 15°≈0.26, 20°≈0.34, 30°≈0.50.
  hallux: {
    mildAbove: 0.26, // ≥ ~15° appearance → mild
    moderatePlusAbove: 0.34 // ≥ ~20° appearance → moderate_plus
  },

  // --- Instep height: AHI = Hd / TL (side view) ---
  // Mean ≈ 0.34. Vertical height is the most perspective-sensitive measure, so
  // the AHI read only refines the qualitative low/normal/high call.
  ahi: {
    lowBelow: 0.3, // < 0.30 → low / flat
    highAbove: 0.37 // > 0.37 → high, else normal
  },

  // --- Sanity clamp for any width ratio (model or landmark derived) ---
  ratioBounds: { min: 0.25, max: 0.6 },

  // --- Anatomical plausibility (top view), as fraction of foot length from heel.
  // The metatarsal heads (the widest part / ball) sit in this band; landmarks
  // far outside it are implausible and get their confidence docked.
  plausibility: {
    ballMinFromHeel: 0.55,
    ballMaxFromHeel: 0.82
  },

  // --- Capture geometry gate (IMU). Target front-back tilt (beta) per view and
  // the tolerance beyond which a shot is flagged bad_angle for a re-take. Kept
  // generous so only clearly-wrong angles trigger a re-shoot.
  imu: {
    targetBeta: { top: 0, oblique: 45, side: 90 } as Record<string, number>,
    betaGateTolerance: 30,
    gammaGateTolerance: 30,
    // Below this much residual tilt we skip de-tilt correction entirely (noise).
    minCorrectionDeg: 4
  },

  // --- Client-side quality pre-check (canvas). Soft signals: they warn and
  // offer a re-take before upload, they do not hard-block (the user can keep a
  // shot the heuristic dislikes). Tuned for the ~1568px JPEG capture path.
  quality: {
    // Variance of the Laplacian on the luma plane; below → likely blurry.
    blurVarianceMin: 55,
    // Fraction of near-black / near-white pixels above which we warn.
    darkFractionMax: 0.6,
    brightFractionMax: 0.35,
    darkLevel: 10,
    brightLevel: 248,
    // Live-capture burst: frames grabbed behind one tap; sharpest is kept.
    burstFrames: 4,
    burstIntervalMs: 90
  },

  // --- Cross-view foot-length agreement (§8). Lengths normalised per view; a
  // disagreement beyond this fraction flags the offending view low-confidence.
  consistency: {
    lengthTolerance: 0.12
  }
} as const;

// d/h ratio → external appearance angle in degrees (θ = asin(d/h)).
export function halluxAngleFromRatio(ratio: number): number {
  const r = Math.min(1, Math.max(0, ratio));
  return Math.round((Math.asin(r) * 180) / Math.PI);
}
