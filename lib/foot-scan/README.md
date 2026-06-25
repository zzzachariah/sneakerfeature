# Foot Scan

Turns three guided phone photos (top-down, 45° oblique, lateral side — plus an
optional other-foot top-down) into indicative foot-shape traits for shoe fitting.
**Not a medical assessment.**

## Pipeline

```
capture (client)              analyze (server, /api/foot-scan)
─────────────────             ────────────────────────────────
guided shot                   vision model reads each photo and POINTS at
 ├ device tilt @ shutter       named anatomical landmarks (it never eyeballs a
 ├ sharpest-of-burst frame     number); code does all the measuring:
 ├ blur/exposure pre-check      ├ weighted per-point median over N reads → one
 └ clean canvas re-encode       │   consensus set (drops degenerate reads)
        │                       ├ adaptive top-up reads when they disagree
        ▼                       ├ IMU de-tilt + gross-angle gate (geometry.ts)
   POST images + tilt           ├ width W/L, hallux d/h, instep AHI (geometry.ts)
   (+ recent scans as priors)   ├ anatomical-plausibility + divergence checks
                                ├ cross-session fusion + L/R corroboration
                                └ classify + confidence (classify.ts/config.ts)
```

The design principle: **the model only points; every metric is computed
deterministically in code.** Ratios (W/L, d/h, Hd/TL) are scale-free, so they
survive an imprecise length anchor.

## Metrics

| Trait  | Source view | Formula (geometry.ts)                   | Bands (config.ts) |
|--------|-------------|-----------------------------------------|-------------------|
| Width  | top         | W/L, width ⟂ to the heel→toe axis       | `width.*`         |
| Hallux | top         | d/h = sin(external angle), MTP1→big toe | `hallux.*`        |
| Instep | side (+45°) | AHI = Hd/TL, corroborates the model     | `ahi.*`           |
| Toe    | top         | model vote (egyptian/greek/roman/square)| —                 |

Hallux is a **screening** only; `moderate_plus` adds a gentle "consider a
podiatrist" note, never a diagnosis.

## No reference object — how scale/perspective are handled

A physical reference (A4 / card) was rejected as too much user burden. Instead:

- **Absolute mm** comes from the shoe-size length anchor the user picks.
- **Perspective** is corrected with the phone's IMU tilt recorded at the shutter
  (`orientation.ts` → `correctRatioForTilt`): a grossly wrong angle is gated for
  a re-take; a mild residual is corrected out of the width ratio. This recovers
  the part of the accuracy a reference object gave, with no extra user step.
  IMU is available on the live-capture path only; picked/library photos skip it.

## Tuning

Every threshold lives in [`config.ts`](./config.ts) (`FOOT_SCAN_CONFIG`) — width
bands, hallux/AHI bands, IMU tolerances, quality thresholds, sampling. Env vars:
`FOOT_SCAN_API_KEY` (required), `FOOT_SCAN_MODEL` (defaults to
`claude-haiku-4-5-20251001`), `FOOT_SCAN_SAMPLES`, `FOOT_SCAN_TEMPERATURE`. The
packyapi base URL is hardcoded to `https://www.packyapi.com/v1`.

### Where the default bands come from (and their limits)

The defaults are **anchored to published norms**, not guessed — but they are a
starting prior, NOT a substitute for tuning on our own pipeline's output:

- **Width** — foot index (breadth/length) mean ≈ 0.386, SD ≈ 0.022; bands at
  mean ∓ 1 SD / + 2 SD. Our W is a perpendicular ball width from photo
  landmarks (not a caliper breadth) and is ethnicity-dependent, so the mean will
  drift — re-centre on our own distribution. The eventual target is a GB/T 3293
  girth/"型" mapping calibrated on real orders.
- **Arch-height index** — Williams & McClay's AHI: ≈ 0.29 (2000) to ≈ 0.34
  (standing, later cohorts), SD ≈ 0.03; bands at mean ∓ ~1 SD.
- **Hallux** — radiographic HVA bands (normal <15°, mild 15–20°, moderate ≥20°)
  are firm, but our *external* d/h angle under-reads HVA by an unknown offset.
  This is the one band that needs a small **clinically-rated** sample to fix.

These norms are population distributions; they cannot calibrate the systematic
offset between a clinical caliper/radiograph and our photo-landmark metric. That
still requires a labelled validation set (foot photos through this pipeline with
ground-truth labels), grid-searched to match annotations. We will **not** ship
fabricated samples — real photos only.

Sources: foot index — Bhattarai et al., *J Nepal Med Assoc* (PMC11455646);
AHI — Butler/Hillstrom *AHIMS* (PMID 18347117) & Williams/McClay 2000; HVA —
*J Foot Ankle Res* 2:15 and *Arch Orthop Trauma Surg* 2024 (PMC11582200).

## Tests

`npx tsx scripts/test-foot-geometry.mts` — synthetic-landmark checks of the
formulas + scale invariance + tilt correction + landmark aggregation.

## Deferred (intentionally not built here)

- **CV sub-pixel contour refinement** and **coarse-to-fine crop+re-read** — both
  need server-side pixel processing; no image lib (sharp/opencv) is in the deps
  and adding a native one to a working serverless feature wasn't justified.
- **Native camera FOV → exact planar homography de-tilt** — would upgrade the
  in-TS scalar tilt correction to an exact warp, but reading lens intrinsics
  (AVCapture / Camera2) is native-plugin work. The scalar de-tilt ships now.
- **Oblique-view second width estimate** — the 45° view's heavy length
  foreshortening makes its W/L not directly comparable, so it isn't fused in.
- **Foot-length redefinition** — left as heel→longest-toe so the literature-
  anchored W/L bands stay valid; toe-tip noise is handled by aggregation instead.
- **Few-shot annotated exemplars** in the prompt — no labelled foot photos exist
  yet (only derived results are stored, never images).
- **Closed-loop calibration from fit feedback** — needs a feedback channel; the
  thresholds are externalised in `config.ts` so it's ready to wire up.

## High-precision channels (native — planned)

Build-ready specs for the two upgrades that need native code + a device build
(can't be done/verified in the cloud dev env) live in
[`HIGH-PRECISION.md`](./HIGH-PRECISION.md):
**A** native camera FOV → exact homography de-tilt, and **B** depth
(LiDAR/ToF/ARCore) → measurement-grade mm + girth (围度) + arch. Both are
additive tiers with graceful fallback to this photo pipeline, and neither adds
per-scan API cost.
