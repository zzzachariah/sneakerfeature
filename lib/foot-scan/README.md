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
 └ blur/exposure pre-check      ├ landmark-level self-consistency (per-point
        │                       │   median over N reads → one consensus set)
        ▼                       ├ adaptive top-up reads when they disagree
   POST images + tilt           ├ optional 2-model ensemble (FOOT_SCAN_MODEL_2)
                                ├ IMU de-tilt + gross-angle gate (geometry.ts)
                                ├ width W/L, hallux d/h, instep AHI (geometry.ts)
                                ├ anatomical-plausibility + divergence checks
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
bands, hallux/AHI bands, IMU tolerances, quality thresholds, sampling. They are
placeholders seeded from population norms; retune against a labelled validation
set (grid-search the bands to match annotations). Env overrides:
`FOOT_SCAN_MODEL`, `FOOT_SCAN_MODEL_2` (ensemble), `FOOT_SCAN_SAMPLES`,
`FOOT_SCAN_TEMPERATURE`, `FOOT_SCAN_API_KEY` / `FOOT_SCAN_BASE_URL`.

## Tests

`npx tsx scripts/test-foot-geometry.mts` — synthetic-landmark checks of the
formulas + scale invariance + tilt correction + landmark aggregation.

## Deferred (intentionally not built here)

- **CV sub-pixel contour refinement** and **coarse-to-fine crop+re-read** — both
  need server-side pixel processing; no image lib (sharp/opencv) is in the deps
  and adding a native one to a working serverless feature wasn't justified.
- **Few-shot annotated exemplars** in the prompt — no labelled foot photos exist
  yet (only derived results are stored, never images).
- **Closed-loop calibration from fit feedback** — needs a feedback channel; the
  thresholds are externalised in `config.ts` so it's ready to wire up.
