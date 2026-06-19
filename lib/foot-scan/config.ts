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
  // Anchored to the foot index (breadth/length): population mean ≈ 0.386,
  // SD ≈ 0.022 (Bhattarai et al., medical-student cohort). Bands sit at the
  // mean ∓ 1 SD and + 2 SD. NOTE: our W is the perpendicular ball width from
  // photo landmarks, not a caliper breadth, so re-centre on our own data once
  // a labelled set exists (the placeholders just start from a real distribution
  // rather than a guess).
  width: {
    narrowBelow: 0.365, // < mean − 1 SD → narrow
    standardBelow: 0.408, // < mean + 1 SD → standard
    wideBelow: 0.43 // < mean + 2 SD → wide, else extra_wide
  },

  // --- Hallux valgus (SCREENING ONLY, not a diagnosis) ---
  // Radiographic HVA bands are well established: normal < 15°, mild 15–20°,
  // moderate 20–40°, severe ≥ 40° (Journal of Foot & Ankle Research; Arch
  // Orthop Trauma Surg 2024). Our d/h = sin(on-camera "external" angle), which
  // UNDER-reads radiographic HVA, so the cutoffs are set a touch more sensitive
  // than the raw degree→sin values. The d/h→HVA offset is the one thing that
  // genuinely needs a small clinically-rated sample to fix — treat as provisional.
  hallux: {
    mildAbove: 0.23, // ≈ external 13° → mild
    moderatePlusAbove: 0.33 // ≈ external 19° → moderate_plus
  },

  // --- Instep height: AHI = Hd / TL (side view) ---
  // Williams & McClay's arch-height index: mean ≈ 0.29 (original 2000 cohort) to
  // ≈ 0.34 standing in later normative data (Butler/Hillstrom AHIMS; college
  // cohort), SD ≈ 0.03. Bands at mean ∓ ~1 SD. Vertical height is the most
  // perspective-sensitive measure, so AHI only refines the qualitative call.
  ahi: {
    lowBelow: 0.31, // < ~mean − 1 SD → low / flat
    highAbove: 0.37 // > ~mean + 1 SD → high, else normal
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
