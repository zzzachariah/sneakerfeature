// Channel B (depth) — measurement core.
//
// Pure geometry: a metric 3D point cloud of a foot standing on a floor → real-
// millimetre measurements (length, width, instep height, ball girth). This is
// platform-agnostic and unit-tested with synthetic clouds. The native ARKit /
// ARCore capture that PRODUCES the cloud (depth → fused points + intrinsics) is
// a separate, device-only build — see HIGH-PRECISION.md — and is NOT implemented
// or verified yet. This module is what that native code feeds into.

export type Vec3 = [number, number, number];

export type DepthMeasurements = {
  foot_length_mm: number;
  foot_width_mm: number;
  instep_height_mm: number;
  // Perimeter of the ball cross-section — approximate (top hull closed along the
  // floor); refine once real scans exist. null when too few points in the slab.
  ball_girth_mm: number | null;
  point_count: number;
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

// Small deterministic RNG so RANSAC (and tests) are reproducible.
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Plane = { n: Vec3; d: number }; // unit normal n, plane: n·x + d = 0

// Dominant plane via RANSAC — the floor, since the floor dwarfs the foot.
function fitFloor(points: Vec3[], tol: number, rand: () => number, iters = 200): Plane | null {
  if (points.length < 3) return null;
  let best: Plane | null = null;
  let bestInliers = -1;
  for (let it = 0; it < iters; it++) {
    const a = points[(rand() * points.length) | 0];
    const b = points[(rand() * points.length) | 0];
    const c = points[(rand() * points.length) | 0];
    const nRaw = cross(sub(b, a), sub(c, a));
    const nl = len3(nRaw);
    if (nl < 1e-9) continue;
    const n: Vec3 = [nRaw[0] / nl, nRaw[1] / nl, nRaw[2] / nl];
    const d = -dot(n, a);
    let inliers = 0;
    for (const p of points) if (Math.abs(dot(n, p) + d) <= tol) inliers++;
    if (inliers > bestInliers) {
      bestInliers = inliers;
      best = { n, d };
    }
  }
  if (!best) return null;
  // Orient the normal so the foot (the points OFF the floor) sits on the +side.
  let pos = 0;
  let neg = 0;
  for (const p of points) {
    const s = dot(best.n, p) + best.d;
    if (s > tol) pos++;
    else if (s < -tol) neg++;
  }
  if (neg > pos) best = { n: [-best.n[0], -best.n[1], -best.n[2]], d: -best.d };
  return best;
}

// 2D PCA → principal axis angle (radians).
function principalAxis(pts2: [number, number][]): { ux: number; uy: number } {
  const n = pts2.length;
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts2) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts2) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // Largest-eigenvalue eigenvector of [[sxx,sxy],[sxy,syy]].
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { ux: Math.cos(theta), uy: Math.sin(theta) };
}

// Convex-hull perimeter (Andrew's monotone chain) of 2D points.
function hullPerimeter(pts: [number, number][]): number {
  if (pts.length < 3) return 0;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross2 = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: number[][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let per = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    per += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return per;
}

export function measureFootCloud(
  points: Vec3[],
  opts: { unitToMm?: number; planeTolMm?: number; seed?: number } = {}
): DepthMeasurements | null {
  const unitToMm = opts.unitToMm ?? 1000; // ARKit/ARCore report metres
  const tolMm = opts.planeTolMm ?? 5;
  const tol = tolMm / unitToMm;
  if (points.length < 50) return null;

  const rand = lcg(opts.seed ?? 12345);
  const floor = fitFloor(points, tol, rand);
  if (!floor) return null;

  // Foot = points clearly above the floor.
  const foot = points.filter((p) => dot(floor.n, p) + floor.d > tol);
  if (foot.length < 30) return null;

  // In-plane basis (u, v) ⟂ floor normal.
  const ref: Vec3 = Math.abs(floor.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = cross(floor.n, ref);
  const ul = len3(u);
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = cross(floor.n, u); // already unit (n, u unit & orthogonal)

  // Footprint (u,v) + height above floor for each foot point.
  const foot2: [number, number][] = [];
  const heights: number[] = [];
  for (const p of foot) {
    foot2.push([dot(p, u), dot(p, v)]);
    heights.push(dot(floor.n, p) + floor.d);
  }

  // Long axis from PCA of the footprint; rotate footprint into (length, breadth).
  const { ux, uy } = principalAxis(foot2);
  const along: number[] = [];
  const across: number[] = [];
  for (const [x, y] of foot2) {
    along.push(x * ux + y * uy);
    across.push(-x * uy + y * ux);
  }
  const aMin = Math.min(...along);
  const aMax = Math.max(...along);
  const lengthMm = (aMax - aMin) * unitToMm;
  const widthMm = (Math.max(...across) - Math.min(...across)) * unitToMm;

  // Instep height: max height in a band around 50% of the length.
  const lenSpan = aMax - aMin;
  const midLo = aMin + 0.45 * lenSpan;
  const midHi = aMin + 0.55 * lenSpan;
  let instep = 0;
  for (let i = 0; i < along.length; i++) if (along[i] >= midLo && along[i] <= midHi) instep = Math.max(instep, heights[i]);
  const instepMm = instep * unitToMm;

  // Ball girth: the slab (along the length) with the greatest breadth ≈ the ball
  // line; girth ≈ perimeter of its (breadth, height) cross-section closed along
  // the floor. Approximate — refine with real scans.
  let ballGirthMm: number | null = null;
  {
    const bins = 20;
    let bestBin = -1;
    let bestBreadth = -1;
    const binOf = (a: number) => Math.min(bins - 1, Math.max(0, Math.floor(((a - aMin) / lenSpan) * bins)));
    const binAcross: number[][] = Array.from({ length: bins }, () => []);
    for (let i = 0; i < along.length; i++) binAcross[binOf(along[i])].push(across[i]);
    for (let b = 0; b < bins; b++) {
      if (binAcross[b].length < 5) continue;
      const breadth = Math.max(...binAcross[b]) - Math.min(...binAcross[b]);
      if (breadth > bestBreadth) {
        bestBreadth = breadth;
        bestBin = b;
      }
    }
    if (bestBin >= 0) {
      const slab: [number, number][] = [];
      for (let i = 0; i < along.length; i++) {
        if (binOf(along[i]) !== bestBin) continue;
        slab.push([across[i], heights[i]]); // (breadth, height) cross-section
        slab.push([across[i], 0]); // close along the floor
      }
      if (slab.length >= 6) ballGirthMm = hullPerimeter(slab) * unitToMm;
    }
  }

  return {
    foot_length_mm: Math.round(lengthMm),
    foot_width_mm: Math.round(widthMm),
    instep_height_mm: Math.round(instepMm),
    ball_girth_mm: ballGirthMm !== null ? Math.round(ballGirthMm) : null,
    point_count: foot.length
  };
}
