// Geometry unit tests for the Foot Scan (spec §11).
//
// Synthetic landmark coordinates with known answers verify that M6 computes the
// documented formulas — width/length, hallux d/h, AHI — and that the ratios are
// scale-invariant. Run: npx tsx scripts/test-foot-geometry.mts

import {
  ratioFromPoints,
  halluxRatioFromPoints,
  ahiFromPoints,
  ballPositionFraction,
  correctRatioForTilt,
  medianLandmarks,
  isDegenerateTop,
  detiltHomography,
  applyHomography,
  rectifiedRatioWithFov,
  focalPxFromFov,
  type NormLandmarks
} from "../lib/foot-scan/geometry";
import { halluxAngleFromRatio } from "../lib/foot-scan/config";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}
const near = (a: number | null, b: number, eps = 1e-3) => a !== null && Math.abs(a - b) < eps;

const empty: NormLandmarks = {
  heel: null,
  toe: null,
  wide_medial: null,
  wide_lateral: null,
  hallux_tip: null,
  mtp1: null,
  toe2: null,
  heel_ground: null,
  mtp1_ground: null,
  dorsum_apex: null
};

const SQ = { w: 1000, h: 1000 };

// --- width / length --------------------------------------------------------
// Heel→toe vertical (length 0.8·h); ball chord horizontal (width 0.304·w).
const widthFoot: NormLandmarks = {
  ...empty,
  heel: [0.5, 0.9],
  toe: [0.5, 0.1],
  wide_medial: [0.348, 0.5],
  wide_lateral: [0.652, 0.5]
};
check("W/L ratio matches construction (~0.38)", near(ratioFromPoints(widthFoot, SQ), 0.38, 2e-3), ratioFromPoints(widthFoot, SQ));

// Scale invariance: proportional resize must not change the ratio.
const r1 = ratioFromPoints(widthFoot, { w: 1000, h: 1000 });
const r2 = ratioFromPoints(widthFoot, { w: 3000, h: 3000 });
check("W/L is scale-invariant", r1 !== null && r2 !== null && Math.abs(r1 - r2) < 1e-9, [r1, r2]);

// Perpendicular width: a fore/aft offset between the two ball points must NOT
// inflate width (it's measured square to the long axis).
const skewBall: NormLandmarks = { ...widthFoot, wide_medial: [0.348, 0.45], wide_lateral: [0.652, 0.55] };
check("width uses perpendicular component (fore/aft offset cancels)", near(ratioFromPoints(skewBall, SQ), 0.38, 2e-3), ratioFromPoints(skewBall, SQ));

// --- hallux d/h ( = sin θ) -------------------------------------------------
// Axis points "up"; big toe leans 30° off it from the MTP1 joint.
const theta = 30;
const h = 100; // px
const mtp1: [number, number] = [0.45, 0.45];
const tip: [number, number] = [
  mtp1[0] + (h * Math.sin((theta * Math.PI) / 180)) / SQ.w,
  mtp1[1] - (h * Math.cos((theta * Math.PI) / 180)) / SQ.h
];
const halluxFoot: NormLandmarks = { ...widthFoot, mtp1, hallux_tip: tip };
check("hallux d/h = sin(30°) ≈ 0.5", near(halluxRatioFromPoints(halluxFoot, SQ), 0.5, 2e-3), halluxRatioFromPoints(halluxFoot, SQ));
check("hallux angle from d/h ≈ 30°", halluxAngleFromRatio(0.5) === 30, halluxAngleFromRatio(0.5));
check("hallux needs both mtp1 + tip", halluxRatioFromPoints(widthFoot, SQ) === null);

// --- AHI = Hd / TL ---------------------------------------------------------
// Ground span 0.8·w horizontal; apex 0.3·h above the ground line.
const sideFoot: NormLandmarks = {
  ...empty,
  heel_ground: [0.1, 0.8],
  mtp1_ground: [0.9, 0.8],
  dorsum_apex: [0.5, 0.5]
};
check("AHI = 0.3/0.8 = 0.375", near(ahiFromPoints(sideFoot, SQ), 0.375, 2e-3), ahiFromPoints(sideFoot, SQ));

// --- ball plausibility position --------------------------------------------
check("ball position ~0.5 of length from heel", near(ballPositionFraction(widthFoot, SQ), 0.5, 1e-3), ballPositionFraction(widthFoot, SQ));

// --- IMU tilt correction ---------------------------------------------------
check("no tilt → unchanged", near(correctRatioForTilt(0.4, 0, 0, 4), 0.4));
check("sub-threshold tilt ignored", near(correctRatioForTilt(0.4, 3, 0, 4), 0.4));
check("20° pitch shrinks ratio by cos(20°)", near(correctRatioForTilt(0.4, 20, 0, 4), 0.4 * Math.cos((20 * Math.PI) / 180), 1e-3));
check("correction factor is clamped", correctRatioForTilt(0.4, 80, 0, 4) >= 0.4 * 0.85 - 1e-9);

// --- landmark aggregation (per-point median) -------------------------------
const reads: NormLandmarks[] = [
  { ...empty, heel: [0.5, 0.9] },
  { ...empty, heel: [0.52, 0.92] },
  { ...empty, heel: [0.51, 0.91] } // median
];
const agg = medianLandmarks(reads);
check("median landmark picks the middle read", near(agg.points.heel?.[0] ?? null, 0.51) && near(agg.points.heel?.[1] ?? null, 0.91), agg.points.heel);
check("dispersion is non-negative", agg.dispersion >= 0, agg.dispersion);

// --- weighted aggregation + degenerate-read rejection ----------------------
const wreads: NormLandmarks[] = [
  { ...empty, heel: [0.4, 0.9] },
  { ...empty, heel: [0.5, 0.9] },
  { ...empty, heel: [0.8, 0.9] }
];
check("unweighted median = middle", near(medianLandmarks(wreads).points.heel?.[0] ?? null, 0.5), medianLandmarks(wreads).points.heel);
check("weighted median leans to the heavy read", near(medianLandmarks(wreads, [1, 1, 5]).points.heel?.[0] ?? null, 0.8), medianLandmarks(wreads, [1, 1, 5]).points.heel);

const degBall: NormLandmarks = { ...widthFoot, wide_medial: [0.45, 0.85], wide_lateral: [0.55, 0.85] };
check("degenerate when the ball sits at the heel", isDegenerateTop(degBall, SQ) === true);
check("normal foot is not degenerate", isDegenerateTop(widthFoot, SQ) === false);

// --- Channel A: FOV homography de-tilt -------------------------------------
const radD = (d: number) => (d * Math.PI) / 180;
function invert3(m: number[][]): number[][] {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]
  ];
}

check("focalPx from 90° FOV = half long edge", near(focalPxFromFov(90, SQ), SQ.w / 2, 1e-6), focalPxFromFov(90, SQ));
check(
  "zero-tilt rectify == plain ratio",
  near(rectifiedRatioWithFov(widthFoot, SQ, 0, 0, 65), ratioFromPoints(widthFoot, SQ) as number, 1e-6)
);

// Forward-tilt the true points, then rectify must recover the original W/L.
const fpx = focalPxFromFov(65, SQ) as number;
const Hfwd = invert3(detiltHomography(fpx, SQ.w / 2, SQ.h / 2, radD(15), radD(8)));
const projN = (pt: [number, number]): [number, number] => {
  const o = applyHomography(Hfwd, pt[0] * SQ.w, pt[1] * SQ.h);
  return [o[0] / SQ.w, o[1] / SQ.h];
};
const tilted: NormLandmarks = {
  ...widthFoot,
  heel: projN(widthFoot.heel as [number, number]),
  toe: projN(widthFoot.toe as [number, number]),
  wide_medial: projN(widthFoot.wide_medial as [number, number]),
  wide_lateral: projN(widthFoot.wide_lateral as [number, number])
};
check(
  "rectify inverts a known tilt (recovers W/L)",
  near(rectifiedRatioWithFov(tilted, SQ, 15, 8, 65), ratioFromPoints(widthFoot, SQ) as number, 2e-3),
  [rectifiedRatioWithFov(tilted, SQ, 15, 8, 65), ratioFromPoints(widthFoot, SQ)]
);

console.log(`\nfoot geometry: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
