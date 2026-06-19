// Pixel-space geometry for the foot scan.
//
// The vision model returns four anatomical landmarks per foot as normalized
// [x, y] coordinates (x = fraction of image width, y = fraction of image
// height). Turning those into a width/length ratio needs real pixel distances,
// so we un-normalize with the image's actual dimensions — hence the tiny
// JPEG/PNG header parsers below. The analysed photos are always JPEG (every
// capture path re-encodes to JPEG); PNG is handled as a cheap safety net.
//
// Computing the ratio in code from landmarks is markedly more robust than asking
// the model to eyeball a single decimal: the model only has to *point* at the
// extremes (an easy visual task), and the arithmetic — including the image's
// aspect ratio — is done deterministically here.

export type ImageSize = { w: number; h: number };

export function parseImageSize(dataUrl: string): ImageSize | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  } catch {
    return null;
  }
  return parseJpegSize(buf) ?? parsePngSize(buf);
}

function parsePngSize(buf: Buffer): ImageSize | null {
  // 89 50 4E 47 signature; IHDR carries width @ byte 16, height @ byte 20.
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

function parseJpegSize(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 3 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    // Skip any run of 0xff fill bytes to land on the real marker code.
    let p = off + 1;
    while (p < buf.length && buf[p] === 0xff) p++;
    if (p >= buf.length) break;
    const marker = buf[p];
    off = p + 1;
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (off + 1 >= buf.length) break;
    const len = buf.readUInt16BE(off); // length includes these 2 bytes
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (off + 7 > buf.length) break;
      const h = buf.readUInt16BE(off + 3);
      const w = buf.readUInt16BE(off + 5);
      return w > 0 && h > 0 ? { w, h } : null;
    }
    off += len;
  }
  return null;
}

export type Pt = [number, number];

function isPt(v: unknown): v is Pt {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// Named, normalized [x,y] landmark points (0..1 of width/height). Any point may
// be null when the model could not place it. Top-view points are the four
// extremes plus the optional hallux/MTP1/second-toe; side-view points carry the
// heel & ball ground contacts and the dorsum apex.
export type NormLandmarks = {
  heel: Pt | null;
  toe: Pt | null;
  wide_medial: Pt | null;
  wide_lateral: Pt | null;
  hallux_tip: Pt | null;
  mtp1: Pt | null;
  toe2: Pt | null;
  heel_ground: Pt | null;
  mtp1_ground: Pt | null;
  dorsum_apex: Pt | null;
};

const NORM_KEYS: (keyof NormLandmarks)[] = [
  "heel",
  "toe",
  "wide_medial",
  "wide_lateral",
  "hallux_tip",
  "mtp1",
  "toe2",
  "heel_ground",
  "mtp1_ground",
  "dorsum_apex"
];

// Tolerant parse of a model landmarks object into normalized points, accepting a
// few alias spellings the model sometimes emits.
export function parseLandmarks(raw: unknown): NormLandmarks {
  const lm = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (...keys: string[]): Pt | null => {
    for (const k of keys) {
      const v = lm[k];
      if (isPt(v)) return [clamp01(v[0]), clamp01(v[1])];
    }
    return null;
  };
  return {
    heel: pick("heel"),
    toe: pick("toe", "toe_tip", "longest_toe"),
    wide_medial: pick("wide_medial", "medial"),
    wide_lateral: pick("wide_lateral", "lateral"),
    hallux_tip: pick("hallux_tip", "big_toe", "hallux"),
    mtp1: pick("mtp1", "mtp1_joint", "first_mtp", "ball_medial_joint"),
    toe2: pick("toe2", "second_toe", "second_toe_tip"),
    heel_ground: pick("heel_ground", "heel_floor"),
    mtp1_ground: pick("mtp1_ground", "ball_ground", "forefoot_ground"),
    dorsum_apex: pick("dorsum_apex", "instep_apex", "midfoot_top")
  };
}

const toPx = (pt: Pt, size: ImageSize): Pt => [pt[0] * size.w, pt[1] * size.h];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Perpendicular distance from point p to the line through a in unit direction u.
function perpDistance(p: Pt, a: Pt, ux: number, uy: number): number {
  const vx = p[0] - a[0];
  const vy = p[1] - a[1];
  return Math.abs(vx * uy - vy * ux); // |v × û|
}

// Core width/length math in pixel space (shared by the public helpers).
//
// Length is the heel→toe distance (the foot's long axis). Width is the medial→
// lateral breadth measured PERPENDICULAR to that axis — the magnitude of the
// cross product with the unit long axis. Using the perpendicular component
// (rather than the raw medial-to-lateral chord) cancels any fore/aft offset
// between the two ball points, which would otherwise inflate the width; it
// matches how foot width is measured anatomically (across the ball, square to
// the length).
function widthLengthRatioPx(heel: Pt, toe: Pt, med: Pt, lat: Pt): number | null {
  const ax = toe[0] - heel[0];
  const ay = toe[1] - heel[1];
  const lengthPx = Math.hypot(ax, ay);
  if (lengthPx <= 0) return null;
  const ux = ax / lengthPx;
  const uy = ay / lengthPx;
  const widthPx = Math.abs((lat[0] - med[0]) * uy - (lat[1] - med[1]) * ux);
  if (widthPx <= 0) return null;
  return widthPx / lengthPx;
}

// width/length ratio from the four named landmarks (model object form). Returns
// null when the landmarks or image size are missing/unusable so the caller can
// fall back to the model's own width_ratio estimate.
export function ratioFromLandmarks(landmarks: unknown, size: ImageSize | null): number | null {
  if (!size) return null;
  return ratioFromPoints(parseLandmarks(landmarks), size);
}

// width/length ratio from already-parsed normalized points.
export function ratioFromPoints(p: NormLandmarks, size: ImageSize): number | null {
  if (!p.heel || !p.toe || !p.wide_medial || !p.wide_lateral) return null;
  return widthLengthRatioPx(
    toPx(p.heel, size),
    toPx(p.toe, size),
    toPx(p.wide_medial, size),
    toPx(p.wide_lateral, size)
  );
}

// Hallux deviation as d/h ( = sin of the on-camera "external" angle), from the
// top-down points. The reference axis is the foot long axis (heel→toe); d is the
// perpendicular offset of the big-toe tip from a line through the 1st-MTP joint
// parallel to that axis, and h is the big-toe length (MTP1→tip). Scale-free.
export function halluxRatioFromPoints(p: NormLandmarks, size: ImageSize): number | null {
  if (!p.heel || !p.toe || !p.mtp1 || !p.hallux_tip) return null;
  const heel = toPx(p.heel, size);
  const toe = toPx(p.toe, size);
  const mtp1 = toPx(p.mtp1, size);
  const tip = toPx(p.hallux_tip, size);
  const ax = toe[0] - heel[0];
  const ay = toe[1] - heel[1];
  const axisLen = Math.hypot(ax, ay);
  if (axisLen <= 0) return null;
  const ux = ax / axisLen;
  const uy = ay / axisLen;
  const h = dist(mtp1, tip);
  if (h <= 0) return null;
  const d = perpDistance(tip, mtp1, ux, uy);
  return Math.min(1, d / h);
}

// Arch-height index AHI = Hd / TL from the side-view points. TL is the heel→ball
// ground span; Hd is the height of the dorsum apex above that ground line
// (its perpendicular distance to it). Scale-free.
export function ahiFromPoints(p: NormLandmarks, size: ImageSize): number | null {
  if (!p.heel_ground || !p.mtp1_ground || !p.dorsum_apex) return null;
  const heelG = toPx(p.heel_ground, size);
  const ballG = toPx(p.mtp1_ground, size);
  const apex = toPx(p.dorsum_apex, size);
  const gx = ballG[0] - heelG[0];
  const gy = ballG[1] - heelG[1];
  const tl = Math.hypot(gx, gy);
  if (tl <= 0) return null;
  const hd = perpDistance(apex, heelG, gx / tl, gy / tl);
  return hd / tl;
}

// Anatomical plausibility of the ball landmarks (top view): the widest point
// should sit in a band along the foot length measured from the heel. Returns the
// ball's longitudinal position as a fraction of foot length (0 = heel, 1 = toe),
// or null if it can't be computed. Callers compare it against config bounds.
export function ballPositionFraction(p: NormLandmarks, size: ImageSize): number | null {
  if (!p.heel || !p.toe || !p.wide_medial || !p.wide_lateral) return null;
  const heel = toPx(p.heel, size);
  const toe = toPx(p.toe, size);
  const ax = toe[0] - heel[0];
  const ay = toe[1] - heel[1];
  const len2 = ax * ax + ay * ay;
  if (len2 <= 0) return null;
  const mid: Pt = [
    (p.wide_medial[0] * size.w + p.wide_lateral[0] * size.w) / 2,
    (p.wide_medial[1] * size.h + p.wide_lateral[1] * size.h) / 2
  ];
  // Projection of the ball midpoint onto the heel→toe axis, normalised.
  const t = ((mid[0] - heel[0]) * ax + (mid[1] - heel[1]) * ay) / len2;
  return t;
}

// First-order tilt correction for the width ratio using the device IMU.
//
// For the guided top-down shot the foot's long axis runs roughly head-to-foot
// (the beta / front-back tilt direction) and its width runs left-right (the
// gamma / roll direction). A residual pitch compresses the measured LENGTH by
// ~cos(beta) (inflating W/L), and roll compresses the measured WIDTH by
// ~cos(gamma) (deflating W/L). We undo both: ratio·cos(betaResidual)/cos(gamma).
// No camera intrinsics are needed. The factor is clamped so a noisy sensor read
// can never wildly skew the ratio, and corrections below a few degrees are
// ignored as noise.
export function correctRatioForTilt(
  ratio: number,
  betaResidualDeg: number,
  gammaDeg: number,
  minDeg: number
): number {
  const br = Math.abs(betaResidualDeg) < minDeg ? 0 : betaResidualDeg;
  const gr = Math.abs(gammaDeg) < minDeg ? 0 : gammaDeg;
  if (br === 0 && gr === 0) return ratio;
  const rad = (d: number) => (d * Math.PI) / 180;
  const cb = Math.cos(rad(Math.min(40, Math.abs(br))));
  const cg = Math.cos(rad(Math.min(40, Math.abs(gr))));
  const factor = Math.min(1.18, Math.max(0.85, cb / cg));
  return ratio * factor;
}

// Per-point coordinate-wise median across N reads → one consensus landmark set,
// plus a dispersion score (mean per-point spread in normalized units) used to
// derive an honest, geometry-grounded confidence. Aggregating the POINTS (then
// computing one ratio) is more robust than aggregating N noisy ratios: a single
// mis-placed point is outvoted per-point instead of corrupting a whole read.
export function medianLandmarks(reads: NormLandmarks[]): {
  points: NormLandmarks;
  dispersion: number;
} {
  const out = {} as NormLandmarks;
  const spreads: number[] = [];
  for (const key of NORM_KEYS) {
    const pts = reads.map((r) => r[key]).filter((p): p is Pt => p !== null);
    if (!pts.length) {
      out[key] = null;
      continue;
    }
    const xs = pts.map((p) => p[0]).sort((a, b) => a - b);
    const ys = pts.map((p) => p[1]).sort((a, b) => a - b);
    const med = (arr: number[]) => {
      const m = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
    };
    const mx = med(xs);
    const my = med(ys);
    out[key] = [mx, my];
    // Spread = mean distance of the reads from the consensus point.
    if (pts.length > 1) {
      const s = pts.reduce((acc, p) => acc + Math.hypot(p[0] - mx, p[1] - my), 0) / pts.length;
      spreads.push(s);
    }
  }
  const dispersion = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
  return { points: out, dispersion };
}
